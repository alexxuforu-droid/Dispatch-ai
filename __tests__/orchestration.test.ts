/**
 * Headless regression suite for the orchestration core.
 * Pure TypeScript: Coordinator, review selectors, replay, event store.
 * No provider, no native modules, fully deterministic.
 */

// model-runner reaches the usage ledger, which reaches AsyncStorage. The ledger itself is
// real here (its eviction behaviour is under test); only the storage behind it is memory.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => (store.has(key) ? store.get(key)! : null),
      setItem: async (key: string, value: string) => { store.set(key, value); },
      removeItem: async (key: string) => { store.delete(key); },
      clear: async () => { store.clear(); },
      getAllKeys: async () => [...store.keys()],
    },
  };
});

import { Coordinator, AgentExecutor, AgentResult, AutoReviewer, RunApproval } from '../src/orchestration/coordinator';
import { MemoryEventStore } from '../src/orchestration/event-store';
import { FormatAwareReviewer, scanSecrets, selectCodeReviewer, selectImageReviewer, selectPeerReviewer } from '../src/orchestration/review';
import { replayRun } from '../src/orchestration/replay';
import { Agent, CodeChange, Run, RunEvent, Team, WorkItem } from '../src/orchestration/types';
import { clearGeneratedImages, forgetGeneratedImage, readCachedOrStoredImage, rememberGeneratedImage } from '../src/persistence/generatedImageCache';
import { clearUsage, readUsage } from '../src/persistence/usageLedger';

const perms = { read: true, grep: true, write: true, edit: true };

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: 'builder', name: 'Builder', role: 'Builds code', rank: 2,
    kinds: ['code'], instructions: 'Build.', permissions: perms, ...overrides,
  };
}

function team(agents: Agent[]): Team {
  return { id: 'team-1', name: 'Team', agents };
}

function executor(handler: (step: WorkItem, attempt: number) => Promise<AgentResult> | AgentResult, calls: { step: string; attempt: number }[] = []): { run: AgentExecutor; calls: { step: string; attempt: number }[] } {
  const run: AgentExecutor = {
    execute: async ({ step, attempt }) => {
      calls.push({ step: step.id, attempt: attempt ?? 1 });
      return handler(step, attempt ?? 1);
    },
  };
  return { run, calls };
}

function reviewer(verdicts: { passed: boolean; findings: string[] }[]): { run: AutoReviewer; calls: number } {
  let calls = 0;
  const run: AutoReviewer = {
    review: async () => {
      calls += 1;
      return verdicts[Math.min(calls - 1, verdicts.length - 1)] ?? { passed: true, findings: [] };
    },
  };
  return { run, get calls() { return calls; } };
}

function approval(): { run: RunApproval; calls: { reason: string }[] } {
  const calls: { reason: string }[] = [];
  return { run: { request: async (_run: Run, reason: string) => { calls.push({ reason }); } }, calls };
}

const ok = reviewer([{ passed: true, findings: [] }]);

async function makeRun(items: { title: string; kind: WorkItem['kind']; agentId: string; dependsOn?: number[] }[], agents: Agent[]) {
  const store = new MemoryEventStore();
  const ex = executor(() => ({ summary: 'done' }));
  const gate = approval();
  const coordinator = new Coordinator(store, ex.run, ok.run, gate.run);
  const run = await coordinator.create('Ship it', team(agents), items);
  return { coordinator, store, ex, gate, run };
}

describe('Coordinator.create', () => {
  test('rejects empty brief, empty team, and empty plan', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'done' }));
    const coordinator = new Coordinator(store, ex.run, ok.run, approval().run);
    const agents = [agent()];
    await expect(coordinator.create('  ', team(agents), [{ title: 'A', kind: 'code', agentId: 'builder' }])).rejects.toThrow();
    await expect(coordinator.create(' brief', team([]), [{ title: 'A', kind: 'code', agentId: 'builder' }])).rejects.toThrow();
    await expect(coordinator.create('brief', team(agents), [])).rejects.toThrow();
  });

  test('rejects plan steps naming agents outside the team', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'done' }));
    const fresh = new Coordinator(store, ex.run, ok.run, approval().run);
    await expect(fresh.create('b', team([agent()]), [{ title: 'A', kind: 'code', agentId: 'stranger' }])).rejects.toThrow(/outside this team/);
  });

  test('rejects forward and self dependencies', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'done' }));
    const fresh = new Coordinator(store, ex.run, ok.run, approval().run);
    const agents = [agent()];
    await expect(fresh.create('b', team(agents), [
      { title: 'A', kind: 'code', agentId: 'builder', dependsOn: [1] },
      { title: 'B', kind: 'code', agentId: 'builder' },
    ])).rejects.toThrow(/earlier steps/);
    await expect(fresh.create('b', team(agents), [{ title: 'A', kind: 'code', agentId: 'builder', dependsOn: [0] }])).rejects.toThrow(/earlier steps/);
  });

  test('maps dependencies to stable ids; dependents start blocked', async () => {
    const { run } = await makeRun([
      { title: 'A', kind: 'code', agentId: 'builder' },
      { title: 'B', kind: 'code', agentId: 'builder', dependsOn: [0] },
    ], [agent()]);
    expect(run.items.map(item => item.id)).toEqual(['work-1', 'work-2']);
    expect(run.items[0].status).toBe('ready');
    expect(run.items[1].status).toBe('blocked');
    expect(run.items[1].dependsOn).toEqual(['work-1']);
    expect(run.status).toBe('queued');
  });

  test('snapshots agent profiles and per-agent model ids', async () => {
    const { run } = await makeRun([{ title: 'A', kind: 'code', agentId: 'builder' }], [agent({ modelId: 'm-1' })]);
    expect(run.agentProfiles?.[0].id).toBe('builder');
    expect(run.agentModelIds).toEqual({ builder: 'm-1' });
  });
});

describe('Coordinator.execute', () => {
  test('happy path completes independent items and persists outputs', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({
      summary: 'built',
      messages: [{ to: 'team', text: 'handover', kind: 'handoff' }],
      artifacts: [{ id: 'a-1', runId: '', kind: 'file', name: 'n', uri: 'u', createdBy: 'Builder' }],
      changes: [{ path: 'f.ts', before: 'a', after: 'b', createOnly: true }],
    }));
    const gate = approval();
    const coordinator = new Coordinator(store, ex.run, ok.run, gate.run);
    const run = await coordinator.create('b', team([agent()]), [
      { title: 'A', kind: 'code', agentId: 'builder' },
      { title: 'B', kind: 'code', agentId: 'builder' },
    ]);
    const done = await coordinator.execute(run, team([agent()]));
    expect(done.status).toBe('completed');
    expect(done.items.every(item => item.status === 'done')).toBe(true);
    expect(done.messages.some(message => message.text === 'handover')).toBe(true);
    expect(done.artifacts).toHaveLength(2);
    expect(done.changes).toHaveLength(2);
    const events = await store.read(run.id);
    expect(events[0].type).toBe('run.created');
    expect(events.map(event => event.seq)).toEqual([...events.map(event => event.seq)].sort((a, b) => a - b));
  });

  test('dependent work waits for its prerequisite wave', async () => {
    const order: string[] = [];
    const store = new MemoryEventStore();
    const ex = executor((step) => { order.push(step.id); return { summary: 'ok' }; });
    const coordinator = new Coordinator(store, ex.run, ok.run, approval().run);
    const run = await coordinator.create('b', team([agent()]), [
      { title: 'A', kind: 'code', agentId: 'builder' },
      { title: 'B', kind: 'code', agentId: 'builder', dependsOn: [0] },
    ]);
    const done = await coordinator.execute(run, team([agent()]));
    expect(order).toEqual(['work-1', 'work-2']);
    expect(done.status).toBe('completed');
  });

  test('dependency cycle fails the run with a clear message', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'ok' }));
    const coordinator = new Coordinator(store, ex.run, ok.run, approval().run);
    const run = await coordinator.create('b', team([agent()]), [{ title: 'A', kind: 'code', agentId: 'builder' }]);
    run.items[0].status = 'blocked';
    run.items[0].dependsOn = ['work-999'];
    const done = await coordinator.execute(run, team([agent()]));
    expect(done.status).toBe('failed');
    expect(done.messages[done.messages.length - 1].text).toMatch(/dependency cycle|failed dependency/);
  });

  test('agent without the work kind fails the run', async () => {
    const { coordinator, run } = await makeRun([{ title: 'A', kind: 'image', agentId: 'builder' }], [agent()]);
    const done = await coordinator.execute(run, team([agent()]));
    expect(done.status).toBe('failed');
  });

  test('bounded revisions: two retries then human gate', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'attempt' }));
    const bad = reviewer([
      { passed: false, findings: ['broken'] },
      { passed: false, findings: ['still broken'] },
      { passed: false, findings: ['broken again'] },
    ]);
    const gate = approval();
    const coordinator = new Coordinator(store, ex.run, bad.run, gate.run);
    const run = await coordinator.create('b', team([agent()]), [{ title: 'A', kind: 'code', agentId: 'builder' }]);
    const done = await coordinator.execute(run, team([agent()]));
    expect(ex.calls).toHaveLength(3);
    expect(done.items[0].status).toBe('needs-approval');
    expect(done.status).toBe('needs-approval');
    expect(gate.calls).toHaveLength(1);
    expect(done.messages.some(message => message.from === 'Automatic code reviewer')).toBe(true);
  });

  test('passing revision completes without a human gate', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'attempt' }));
    const flaky = reviewer([{ passed: false, findings: ['fix this'] }, { passed: true, findings: [] }]);
    const gate = approval();
    const coordinator = new Coordinator(store, ex.run, flaky.run, gate.run);
    const run = await coordinator.create('b', team([agent()]), [{ title: 'A', kind: 'code', agentId: 'builder' }]);
    const done = await coordinator.execute(run, team([agent()]));
    expect(ex.calls).toHaveLength(2);
    expect(done.status).toBe('completed');
    expect(gate.calls).toHaveLength(0);
  });

  test('pre-aborted signal cancels without executing', async () => {
    const { coordinator, ex, run } = await makeRun([{ title: 'A', kind: 'code', agentId: 'builder' }], [agent()]);
    const controller = new AbortController();
    controller.abort();
    const done = await coordinator.execute(run, team([agent()]), controller.signal);
    expect(done.status).toBe('cancelled');
    expect(ex.calls).toHaveLength(0);
  });

  test('mid-run abort preserves completed siblings', async () => {
    const store = new MemoryEventStore();
    const controller = new AbortController();
    let first = true;
    const ex = executor(() => {
      if (first) { first = false; return { summary: 'kept', messages: [{ to: 'team', text: 'sibling work', kind: 'update' }] }; }
      controller.abort();
      return { summary: 'lost' };
    });
    const coordinator = new Coordinator(store, ex.run, ok.run, approval().run);
    const run = await coordinator.create('b', team([agent()]), [
      { title: 'A', kind: 'code', agentId: 'builder' },
      { title: 'B', kind: 'code', agentId: 'builder' },
    ]);
    const done = await coordinator.execute(run, team([agent()]), controller.signal);
    expect(done.status).toBe('cancelled');
    expect(done.messages.some(message => message.text === 'sibling work')).toBe(true);
  });

  test('resume re-runs gated work, supersedes stale proposals, keeps done work', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'v', changes: [{ path: 'f.ts', before: 'a', after: 'b', createOnly: true }] }));
    const bad = reviewer([{ passed: true, findings: [] }, { passed: false, findings: ['needs work'] }, { passed: false, findings: ['x'] }, { passed: false, findings: ['y'] }, { passed: true, findings: [] }]);
    const gate = approval();
    const coordinator = new Coordinator(store, ex.run, bad.run, gate.run);
    const agents = [agent()];
    const run = await coordinator.create('b', team(agents), [
      { title: 'A', kind: 'code', agentId: 'builder' },
      { title: 'B', kind: 'code', agentId: 'builder', dependsOn: [0] },
    ]);
    const paused = await coordinator.execute(run, team(agents));
    expect(paused.status).toBe('needs-approval');
    const stale = paused.changes?.filter(change => change.itemId === 'work-2' && !change.supersededAt) ?? [];
    expect(stale).toHaveLength(1);
    const resumed = await coordinator.execute(paused, team(agents));
    expect(resumed.status).toBe('completed');
    expect(resumed.items[0].status).toBe('done');
    expect(stale[0].supersededAt).toBeTruthy();
    expect(resumed.messages.some(message => message.text.includes('resumed'))).toBe(true);
  });

  test('each-wave checkpoint pauses between waves and resumes clean', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'ok' }));
    const gate = approval();
    const coordinator = new Coordinator(store, ex.run, ok.run, gate.run);
    const agents = [agent()];
    const run = await coordinator.create('b', team(agents), [
      { title: 'A', kind: 'code', agentId: 'builder' },
      { title: 'B', kind: 'code', agentId: 'builder', dependsOn: [0] },
    ]);
    run.checkpointPolicy = 'each-wave';
    const paused = await coordinator.execute(run, team(agents));
    expect(paused.status).toBe('needs-approval');
    expect(paused.checkpointPaused).toBe(true);
    expect(gate.calls).toHaveLength(1);
    const resumed = await coordinator.execute(paused, team(agents));
    expect(resumed.status).toBe('completed');
    expect(resumed.checkpointPaused).toBeFalsy();
  });
});

describe('review selectors', () => {
  const author = agent({ id: 'author', name: 'Author', rank: 2, kinds: ['code', 'review'] });
  const senior = agent({ id: 'senior', name: 'Senior', rank: 5, kinds: ['code', 'review'] });
  const junior = agent({ id: 'junior', name: 'Junior', rank: 2, kinds: ['code', 'review'] });

  test('selectPeerReviewer needs rank >= 4 and strictly above the author', () => {
    expect(selectPeerReviewer(team([author, senior]), 'author')?.id).toBe('senior');
    expect(selectPeerReviewer(team([author, junior]), 'author')).toBeUndefined();
    expect(selectPeerReviewer(team([author]), 'author')).toBeUndefined();
  });

  test('selectPeerReviewer needs review and code capabilities', () => {
    const unqualified = agent({ id: 'boss', name: 'Boss', rank: 5, kinds: ['plan'] });
    expect(selectPeerReviewer(team([author, unqualified]), 'author')).toBeUndefined();
  });

  test('selectPeerReviewer picks the highest-ranked eligible peer', () => {
    const lead = agent({ id: 'lead', name: 'Lead', rank: 4, kinds: ['code', 'review'] });
    expect(selectPeerReviewer(team([author, lead, senior]), 'author')?.id).toBe('senior');
  });

  test('selectCodeReviewer never returns the author, even as fallback', () => {
    const solo = team([agent({ id: 'reviewer', name: 'Solo', rank: 5, kinds: ['code', 'review'] })]);
    expect(selectCodeReviewer(solo, 'reviewer')).toBeUndefined();
    expect(selectCodeReviewer(team([author]), 'author')).toBeUndefined();
  });

  test('selectCodeReviewer prefers peer, then named reviewer, then capable agent', () => {
    const named = agent({ id: 'reviewer', name: 'Named', rank: 3, kinds: ['code', 'review'] });
    expect(selectCodeReviewer(team([author, senior, named]), 'author')?.id).toBe('senior');
    expect(selectCodeReviewer(team([author, named]), 'author')?.id).toBe('reviewer');
    const capable = agent({ id: 'cap', name: 'Cap', rank: 2, kinds: ['code', 'review'] });
    expect(selectCodeReviewer(team([author, capable]), 'author')?.id).toBe('cap');
  });
});

describe('FormatAwareReviewer', () => {
  const item = (kind: WorkItem['kind']): WorkItem => ({ id: 'work-1', title: 'T', kind, agentId: 'builder', dependsOn: [], status: 'running', artifactIds: [] });
  const run: Run = { id: 'run-1', brief: 'b', status: 'running', teamId: 't', items: [], messages: [], artifacts: [], createdAt: '', updatedAt: '' };

  test('fails closed when no worker is configured', async () => {
    const code = await new FormatAwareReviewer().review({ run, item: item('code') });
    expect(code.passed).toBe(false);
    expect(code.findings.join(' ')).toMatch(/no code review worker/i);
    const image = await new FormatAwareReviewer().review({ run, item: item('image') });
    expect(image.passed).toBe(false);
  });

  test('ties findings to the failing check', async () => {
    const formatReviewer = new FormatAwareReviewer({ inspect: async () => [{ name: 'secrets-scan', passed: false, detail: 'hardcoded key' }] });
    const verdict = await formatReviewer.review({ run, item: item('code') });
    expect(verdict.passed).toBe(false);
    expect(verdict.findings[0]).toMatch(/secrets-scan.*hardcoded key/);
  });

  test('empty check list fails closed to a human gate', async () => {
    const formatReviewer = new FormatAwareReviewer({ inspect: async () => [] });
    const verdict = await formatReviewer.review({ run, item: item('code') });
    expect(verdict.passed).toBe(false);
    expect(verdict.findings.join(' ')).toMatch(/human review is required/);
  });
});

describe('replayRun', () => {
  function seed(): Run {
    return {
      id: 'run-1', brief: 'b', status: 'queued', teamId: 't',
      items: [{ id: 'work-1', title: 'A', kind: 'code', agentId: 'builder', dependsOn: [], status: 'ready', artifactIds: [] }],
      messages: [], artifacts: [], changes: [], createdAt: 't0', updatedAt: 't0',
    };
  }
  function event(seq: number, type: RunEvent['type'], payload: unknown): RunEvent {
    return { seq, runId: 'run-1', at: `t${seq}`, type, payload };
  }

  test('rebuilds status and item state from out-of-order events', () => {
    const item: WorkItem = { id: 'work-1', title: 'A', kind: 'code', agentId: 'builder', dependsOn: [], status: 'done', artifactIds: [] };
    const rebuilt = replayRun(seed(), [
      event(3, 'run.status', { status: 'completed' }),
      event(1, 'work.finished', { item }),
      event(2, 'run.status', { status: 'running' }),
    ]);
    expect(rebuilt.status).toBe('completed');
    expect(rebuilt.items[0].status).toBe('done');
    expect(rebuilt.updatedAt).toBe('t3');
  });

  test('rebuilds collections from the log, discarding seed-held messages and artifacts', () => {
    const message = { id: 'msg-1', runId: 'run-1', from: 'A', to: 'team', text: 'hi', kind: 'update', createdAt: 't1' } as Run['messages'][number];
    const artifact = { id: 'art-1', runId: 'run-1', kind: 'file', name: 'n', uri: 'u', createdBy: 'A' } as Run['artifacts'][number];
    const base = seed();
    base.messages = [message, { ...message, id: 'msg-orphan' }];
    base.artifacts = [artifact];
    const rebuilt = replayRun(base, [
      event(1, 'agent.message', message),
      event(2, 'artifact.created', artifact),
    ]);
    expect(rebuilt.messages.filter(entry => entry.id === 'msg-1')).toHaveLength(1);
    expect(rebuilt.messages.some(entry => entry.id === 'msg-orphan')).toBe(false);
    expect(rebuilt.artifacts.filter(entry => entry.id === 'art-1')).toHaveLength(1);
  });

  test('applies artifact.created events in seq order', () => {
    const artifact = { id: 'art-1', runId: 'run-1', kind: 'file', name: 'n', uri: 'u', createdBy: 'A' } as Run['artifacts'][number];
    const rebuilt = replayRun(seed(), [
      event(1, 'artifact.created', artifact),
      event(2, 'artifact.created', { ...artifact, id: 'art-2', name: 'second' }),
    ]);
    expect(rebuilt.artifacts.map(entry => entry.id)).toEqual(['art-1', 'art-2']);
  });

  test('drops duplicate and id-less agent.message, artifact.created, and code-change.proposed events', () => {
    const message = { id: 'msg-1', runId: 'run-1', from: 'A', to: 'team', text: 'hi', kind: 'update', createdAt: 't1' } as Run['messages'][number];
    const artifact = { id: 'art-1', runId: 'run-1', kind: 'file', name: 'n', uri: 'u', createdBy: 'A' } as Run['artifacts'][number];
    const change = { id: 'change-1', itemId: 'work-1', path: 'f.ts', before: 'a', after: 'b', createOnly: true, createdBy: 'Builder', attempt: 1 } as CodeChange;
    const rebuilt = replayRun(seed(), [
      event(1, 'agent.message', message),
      event(2, 'agent.message', { ...message, text: 'second copy' }),
      event(3, 'agent.message', { ...message, id: undefined }),
      event(4, 'artifact.created', artifact),
      event(5, 'artifact.created', { ...artifact, name: 'second copy' }),
      event(6, 'artifact.created', { ...artifact, id: undefined }),
      event(7, 'code-change.proposed', change),
      event(8, 'code-change.proposed', { ...change, after: 'c' }),
      event(9, 'code-change.proposed', { ...change, id: undefined }),
    ]);
    expect(rebuilt.messages.map(entry => entry.id)).toEqual(['msg-1']);
    expect(rebuilt.messages[0].text).toBe('hi');
    expect(rebuilt.artifacts.map(entry => entry.id)).toEqual(['art-1']);
    expect(rebuilt.artifacts[0].name).toBe('n');
    expect(rebuilt.changes?.map(entry => entry.id)).toEqual(['change-1']);
    expect(rebuilt.changes?.[0].after).toBe('b');
  });

  test('approval.required records its reason message, with a default when absent', () => {
    const withReason = replayRun(seed(), [event(1, 'approval.required', { itemId: 'work-1', reason: 'human needed' })]);
    expect(withReason.messages).toEqual([{ id: 'msg-replay-1', runId: 'run-1', workItemId: 'work-1', from: 'Dispatch', to: 'team', text: 'human needed', kind: 'finding', createdAt: 't1' }]);
    const fallback = replayRun(seed(), [event(2, 'approval.required', { itemId: 'work-1' })]);
    expect(fallback.messages[0].text).toBe('Human review is required.');
  });

  test('approval.required never reopens a finished item and ignores unknown item ids', () => {
    const finished = seed();
    finished.items[0].status = 'done';
    const doneReplay = replayRun(finished, [event(1, 'approval.required', { itemId: 'work-1', reason: 'late gate' })]);
    expect(doneReplay.items[0].status).toBe('done');
    const unknown = replayRun(seed(), [event(2, 'approval.required', { itemId: 'work-999', reason: 'ghost gate' })]);
    expect(unknown.items[0].status).toBe('ready');
    expect(unknown.messages).toHaveLength(1);
  });

  test('appends work items missing from the seed and ignores malformed payloads', () => {
    const extra: WorkItem = { id: 'work-2', title: 'B', kind: 'code', agentId: 'builder', dependsOn: [], status: 'running', artifactIds: [] };
    const rebuilt = replayRun(seed(), [
      event(1, 'run.status', { status: 42 }),
      event(2, 'work.started', { item: extra }),
      event(3, 'work.finished', { item: { ...extra, status: 'done' } }),
      event(4, 'work.ready', {}),
    ]);
    expect(rebuilt.status).toBe('queued');
    expect(rebuilt.items.map(item => item.id)).toEqual(['work-1', 'work-2']);
    expect(rebuilt.items[1].status).toBe('done');
  });

  test('applies code-change, review, and approval events', () => {
    const change = { id: 'change-1', itemId: 'work-1', path: 'f.ts', before: 'a', after: 'b', createOnly: true, createdBy: 'Builder', attempt: 1 } as CodeChange;
    const rebuilt = replayRun(seed(), [
      event(1, 'code-change.proposed', change),
      event(2, 'review.finding', { itemId: 'work-1', finding: 'fix it', attempt: 1 }),
      event(3, 'approval.required', { itemId: 'work-1', reason: 'human needed' }),
    ]);
    expect(rebuilt.changes?.some(entry => entry.id === 'change-1')).toBe(true);
    expect(rebuilt.messages.some(entry => entry.kind === 'finding' && entry.text.includes('fix it'))).toBe(true);
    expect(rebuilt.items[0].status).toBe('needs-approval');
  });

  test('ignores events from other runs', () => {
    const foreign = { ...event(1, 'run.status', { status: 'completed' }), runId: 'run-2' };
    const rebuilt = replayRun(seed(), [foreign]);
    expect(rebuilt.status).toBe('queued');
    expect(rebuilt.messages).toHaveLength(0);
  });
});

describe('MemoryEventStore', () => {
  test('assigns increasing seq, filters by run and cursor', async () => {
    const store = new MemoryEventStore();
    await store.append({ runId: 'a', type: 'run.status', payload: {}, at: 't' });
    await store.append({ runId: 'b', type: 'run.status', payload: {}, at: 't' });
    const second = await store.append({ runId: 'a', type: 'run.status', payload: {}, at: 't' });
    expect(second.seq).toBe(3);
    expect((await store.read('a')).map(entry => entry.seq)).toEqual([1, 3]);
    expect((await store.read('a', 1)).map(entry => entry.seq)).toEqual([3]);
    expect(await store.read('missing')).toEqual([]);
  });

  test('append snapshots the payload against later mutation', async () => {
    const store = new MemoryEventStore();
    const payload = { item: { id: 'work-1', status: 'running' } };
    await store.append({ runId: 'a', type: 'work.started', payload, at: 't' });
    payload.item.status = 'done';
    const events = await store.read('a');
    expect((events[0].payload as typeof payload).item.status).toBe('running');
  });
});

describe('replayRun mutation events', () => {
  const item: WorkItem = { id: 'work-1', title: 'A', kind: 'code', agentId: 'builder', dependsOn: [], status: 'running', artifactIds: [] };
  const proposal = (): CodeChange => ({ id: 'change-1', itemId: 'work-1', path: 'f.ts', before: 'a', after: 'b', createOnly: true, createdBy: 'Builder', attempt: 1 });
  const seed = (): Run => ({ id: 'run-1', brief: 'b', status: 'queued', teamId: 't', items: [item], messages: [], artifacts: [], changes: [], createdAt: 't0', updatedAt: 't0' });
  const event = (seq: number, type: RunEvent['type'], payload: unknown): RunEvent => ({ seq, runId: 'run-1', at: `t${seq}`, type, payload });

  test('consumes superseded change and artifact flags from run.status payloads', () => {
    const rebuilt = replayRun(seed(), [
      event(1, 'artifact.created', { id: 'a-1', runId: 'run-1', workItemId: 'work-1', kind: 'file', name: 'n', uri: 'u', createdBy: 'Builder' }),
      event(2, 'code-change.proposed', proposal()),
      event(3, 'run.status', { status: 'running', supersededChangeIds: ['change-1'], supersededArtifactIds: ['a-1'] }),
    ]);
    expect(rebuilt.changes?.[0].supersededAt).toBe('t3');
    expect(rebuilt.artifacts[0].supersededAt).toBe('t3');
  });

  test('merges applied changes carried in run.status payloads', () => {
    const rebuilt = replayRun(seed(), [
      event(1, 'code-change.proposed', proposal()),
      event(2, 'run.status', { status: 'completed', appliedChanges: [{ ...proposal(), appliedAt: 'applied-at', approvedBy: 'Senior' }] }),
    ]);
    expect(rebuilt.changes?.[0]).toMatchObject({ appliedAt: 'applied-at', approvedBy: 'Senior' });
  });

  test('checkpointPaused tracks the run.status stream', () => {
    const paused = replayRun(seed(), [event(2, 'run.status', { status: 'needs-approval', checkpointPaused: true })]);
    expect(paused.checkpointPaused).toBe(true);
    const resumed = replayRun(seed(), [
      event(2, 'run.status', { status: 'needs-approval', checkpointPaused: true }),
      event(3, 'run.status', { status: 'running' }),
    ]);
    expect(resumed.checkpointPaused).toBeFalsy();
  });

  test('seeds work items from a run.created plan when the seed has none', () => {
    const bare: Run = { ...seed(), items: [] };
    const rebuilt = replayRun(bare, [event(1, 'run.created', { brief: 'b', teamId: 't', plan: [item] })]);
    expect(rebuilt.items.map(entry => entry.id)).toEqual(['work-1']);
    expect(rebuilt.items[0].status).toBe('running');
  });

  test('copies message and artifact payloads so rebuilt state cannot alias the log', () => {
    const message = { id: 'msg-1', runId: 'run-1', from: 'A', to: 'team', text: 'hi', kind: 'update', createdAt: 't1' } as Run['messages'][number];
    const artifact = { id: 'a-1', runId: 'run-1', workItemId: 'work-1', kind: 'file', name: 'n', uri: 'u', createdBy: 'Builder' };
    const rebuilt = replayRun(seed(), [event(1, 'agent.message', message), event(2, 'artifact.created', artifact)]);
    message.text = 'mutated';
    artifact.uri = 'mutated';
    expect(rebuilt.messages[0].text).toBe('hi');
    expect(rebuilt.artifacts[0].uri).toBe('u');
  });
});

describe('Coordinator logs post-event state changes', () => {
  const coder = agent();
  const bareRun = (id: string): Run => ({ id, brief: 'b', status: 'queued', teamId: 'team-1', items: [], messages: [], artifacts: [], changes: [], createdAt: 't', updatedAt: 't' });
  const flagIds = (events: RunEvent[], flag: 'supersededChangeIds' | 'appliedChanges'): unknown[][] => events
    .filter(entry => entry.type === 'run.status' && Array.isArray((entry.payload as Record<string, unknown>)[flag]))
    .map(entry => (entry.payload as Record<string, unknown>)[flag] as unknown[]);

  test('resume supersedes stale proposals in the event log and replay restores them', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'v', changes: [{ path: 'f.ts', before: 'a', after: 'b', createOnly: true }] }));
    const gated = reviewer([
      { passed: true, findings: [] },
      { passed: false, findings: ['needs work'] },
      { passed: false, findings: ['x'] },
      { passed: false, findings: ['y'] },
      { passed: true, findings: [] },
    ]);
    const coordinator = new Coordinator(store, ex.run, gated.run, approval().run);
    const run = await coordinator.create('b', team([coder]), [
      { title: 'A', kind: 'code', agentId: 'builder' },
      { title: 'B', kind: 'code', agentId: 'builder', dependsOn: [0] },
    ]);
    const paused = await coordinator.execute(run, team([coder]));
    expect(paused.status).toBe('needs-approval');
    const stale = (paused.changes ?? []).filter(change => change.itemId === 'work-2' && !change.supersededAt);
    expect(stale).toHaveLength(1);
    await coordinator.execute(paused, team([coder]));
    const events = await store.read(run.id);
    expect(flagIds(events, 'supersededChangeIds').some(ids => ids.includes(stale[0].id))).toBe(true);
    const rebuilt = replayRun(bareRun(run.id), events);
    expect(rebuilt.status).toBe('completed');
    expect(rebuilt.items.map(entry => `${entry.id}:${entry.status}`)).toEqual(['work-1:done', 'work-2:done']);
    expect(rebuilt.changes?.find(change => change.id === stale[0].id)?.supersededAt).toBeTruthy();
    expect(rebuilt.changes?.filter(change => change.itemId === 'work-2' && !change.supersededAt)).toHaveLength(1);
  });

  test('reviewer-applied changes are logged with their approver', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'v', changes: [{ path: 'f.ts', before: 'a', after: 'b', createOnly: true }] }));
    const applying: AutoReviewer = {
      review: async ({ run }) => {
        for (const change of run.changes ?? []) if (!change.appliedAt) { change.appliedAt = 'applied-at'; change.approvedBy = 'Senior'; }
        return { passed: true, findings: [] };
      },
    };
    const coordinator = new Coordinator(store, ex.run, applying, approval().run);
    const run = await coordinator.create('b', team([coder]), [{ title: 'A', kind: 'code', agentId: 'builder' }]);
    const done = await coordinator.execute(run, team([coder]));
    expect(done.changes?.[0]).toMatchObject({ appliedAt: expect.any(String), approvedBy: 'Senior' });
    const events = await store.read(run.id);
    expect(flagIds(events, 'appliedChanges').flat().length).toBe(1);
    const rebuilt = replayRun(bareRun(run.id), events);
    expect(rebuilt.status).toBe('completed');
    expect(rebuilt.changes?.[0]).toMatchObject({ appliedAt: 'applied-at', approvedBy: 'Senior' });
  });

  test('a peer-applied change survives its revision cycle applied, not superseded', async () => {
    const store = new MemoryEventStore();
    const ex = executor(() => ({ summary: 'v', changes: [{ path: 'f.ts', before: 'a', after: 'b', createOnly: true }] }));
    let reviews = 0;
    const applying: AutoReviewer = {
      review: async ({ run }) => {
        reviews += 1;
        if (reviews === 1) {
          for (const change of run.changes ?? []) if (!change.appliedAt) { change.appliedAt = 'applied-at'; change.approvedBy = 'Senior'; }
          return { passed: false, findings: ['needs work'] };
        }
        return { passed: true, findings: [] };
      },
    };
    const coordinator = new Coordinator(store, ex.run, applying, approval().run);
    const run = await coordinator.create('b', team([coder]), [{ title: 'A', kind: 'code', agentId: 'builder' }]);
    const done = await coordinator.execute(run, team([coder]));
    expect(done.status).toBe('completed');
    const applied = done.changes?.find(change => change.attempt === 1);
    expect(applied).toMatchObject({ appliedAt: 'applied-at', approvedBy: 'Senior' });
    expect(applied?.supersededAt).toBeUndefined();
    const events = await store.read(run.id);
    expect(flagIds(events, 'supersededChangeIds')).toHaveLength(0);
    expect(flagIds(events, 'appliedChanges').flat()).toHaveLength(1);
    const rebuilt = replayRun(bareRun(run.id), events);
    expect(rebuilt.status).toBe('completed');
    const rebuiltApplied = rebuilt.changes?.find(change => change.attempt === 1);
    expect(rebuiltApplied).toMatchObject({ appliedAt: 'applied-at', approvedBy: 'Senior' });
    expect(rebuiltApplied?.supersededAt).toBeUndefined();
  });
});

describe('selectImageReviewer', () => {
  const imgAuthor = agent({ id: 'author', name: 'Author', rank: 2, kinds: ['image', 'review'] });
  const imgCritic = agent({ id: 'art-critic', name: 'Critic', rank: 2, kinds: ['image', 'review'] });
  const imgSenior = agent({ id: 'senior', name: 'Senior', rank: 5, kinds: ['image', 'review'] });
  const imgJunior = agent({ id: 'junior', name: 'Junior', rank: 2, kinds: ['image', 'review'] });

  test('never returns the image author, and an author-only team has no reviewer', () => {
    expect(selectImageReviewer(team([imgAuthor]), 'author')).toBeUndefined();
    expect(selectImageReviewer(team([imgAuthor, imgCritic]), 'author')?.id).toBe('art-critic');
  });

  test('a rank-5 image peer beats rank-2 fallbacks', () => {
    expect(selectImageReviewer(team([imgAuthor, imgCritic, imgJunior, imgSenior]), 'author')?.id).toBe('senior');
    expect(selectImageReviewer(team([imgAuthor, imgJunior]), 'author')?.id).toBe('junior');
  });

  test('falls back to capable agents and an image-capable named reviewer id, still excluding the author', () => {
    const named = agent({ id: 'reviewer', name: 'Named', rank: 3, kinds: ['code', 'review'] });
    expect(selectImageReviewer(team([imgAuthor, named]), 'author')).toBeUndefined();
    const visual = agent({ id: 'reviewer', name: 'Visual', rank: 3, kinds: ['image'] });
    expect(selectImageReviewer(team([imgAuthor, visual]), 'author')?.id).toBe('reviewer');
    const solo = team([agent({ id: 'reviewer', name: 'Critic', rank: 5, kinds: ['image', 'review'] })]);
    expect(selectImageReviewer(solo, 'reviewer')).toBeUndefined();
  });
});

describe('scanSecrets', () => {
  test('flags quoted secret assignments with file, line, and pattern', () => {
    const findings = scanSecrets([{ path: 'src/config.ts', after: 'const port = 8080;\nconst password = "x";\napi_key = "abcd1234"\n' }]);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toEqual({ path: 'src/config.ts', line: 2, pattern: 'password' });
    expect(findings[1]).toEqual({ path: 'src/config.ts', line: 3, pattern: 'api_key' });
  });

  test('ignores content with no secret assignment', () => {
    expect(scanSecrets([])).toEqual([]);
    expect(scanSecrets([{ path: 'a.ts', after: 'const password = "";\nlet count = 3;\nconst apikey = import.meta.env.VITE_KEY;' }])).toEqual([]);
  });

  test('flags the alternate spellings passwd and secret', () => {
    const findings = scanSecrets([{ path: 'src/env.ts', after: 'const port = 8080;\npasswd: "local-only"\nsecret = "topsecret"\nAPI_KEY = "k"\n' }]);
    expect(findings).toHaveLength(3);
    expect(findings[0]).toEqual({ path: 'src/env.ts', line: 2, pattern: 'passwd' });
    expect(findings[1]).toEqual({ path: 'src/env.ts', line: 3, pattern: 'secret' });
    expect(findings[2]).toEqual({ path: 'src/env.ts', line: 4, pattern: 'api_key' });
  });

  test('reports the matched keyword lowercased for any casing', () => {
    const findings = scanSecrets([{ path: 'src/env.ts', after: 'Password = "x"\nSECRET = "y"\nPasswd = "z"\n' }]);
    expect(findings).toEqual([
      { path: 'src/env.ts', line: 1, pattern: 'password' },
      { path: 'src/env.ts', line: 2, pattern: 'secret' },
      { path: 'src/env.ts', line: 3, pattern: 'passwd' },
    ]);
  });

  test('ignores unquoted values and cross-line matches', () => {
    const findings = scanSecrets([{ path: 'src/env.ts', after: 'password = bareword\nsecret = 12345\napikey=\n' }]);
    expect(findings).toEqual([]);
  });

  test('reports findings across several files with separate line numbers', () => {
    const findings = scanSecrets([
      { path: 'src/one.ts', after: 'const passwd = "a";\n' },
      { path: 'src/two.ts', after: 'let ok = true;\nsecret: "b"\n' },
    ]);
    expect(findings).toEqual([
      { path: 'src/one.ts', line: 1, pattern: 'passwd' },
      { path: 'src/two.ts', line: 2, pattern: 'secret' },
    ]);
  });
});

describe('readCachedOrStoredImage', () => {
  afterEach(() => clearGeneratedImages());

  test('returns cached pixels without consulting the stored reader', async () => {
    rememberGeneratedImage('image://run-1', 'CACHED-BYTES');
    expect(await readCachedOrStoredImage('image://run-1', () => 'STORED-BYTES')).toBe('CACHED-BYTES');
  });

  test('rehydrates pixels from the stored reader when the cache is cleared', async () => {
    clearGeneratedImages();
    expect(await readCachedOrStoredImage('image://run-1', () => 'STORED-BYTES')).toBe('STORED-BYTES');
  });

  test('returns undefined when neither the cache nor the reader has pixels', async () => {
    clearGeneratedImages();
    expect(await readCachedOrStoredImage('image://missing', () => undefined)).toBeUndefined();
    forgetGeneratedImage('image://missing');
  });
});

describe('Coordinator wave concurrency cap', () => {
  const plan6 = () => Array.from({ length: 6 }, (_, index) => ({ title: `Step ${index + 1}`, kind: 'code' as const, agentId: 'builder' }));

  function peakInFlight(log: string[]): number {
    let inFlight = 0;
    let peak = 0;
    for (const entry of log) {
      if (entry.startsWith('start:')) peak = Math.max(peak, ++inFlight);
      else if (entry.startsWith('end:')) inFlight -= 1;
    }
    return peak;
  }

  function trackingExecutor(log: string[]): AgentExecutor {
    const runner: AgentExecutor = {
      execute: async ({ step }) => {
        log.push(`start:${step.id}`);
        await new Promise<void>(resolve => { setTimeout(() => resolve(), 5); });
        log.push(`end:${step.id}`);
        return { summary: 'ok' };
      },
    };
    return runner;
  }

  test('caps a six-item wave at two in flight, awaiting each slice', async () => {
    const log: string[] = [];
    const store = new MemoryEventStore();
    const coordinator = new Coordinator(store, trackingExecutor(log), ok.run, approval().run, { maxConcurrency: 2 });
    const run = await coordinator.create('b', team([agent()]), plan6());
    const done = await coordinator.execute(run, team([agent()]));
    expect(log).toHaveLength(12);
    expect(peakInFlight(log)).toBe(2);
    expect(log.indexOf('start:work-5')).toBeGreaterThan(log.indexOf('end:work-1'));
    expect(log.indexOf('start:work-5')).toBeGreaterThan(log.indexOf('end:work-2'));
    expect(done.status).toBe('completed');
    expect(done.items.every(item => item.status === 'done')).toBe(true);
  });

  test('an unset or zero cap starts the whole ready wave at once, as before', async () => {
    for (const options of [undefined, {}, { maxConcurrency: 0 }, { maxConcurrency: -1 }]) {
      const log: string[] = [];
      const store = new MemoryEventStore();
      const coordinator = new Coordinator(store, trackingExecutor(log), ok.run, approval().run, options);
      const run = await coordinator.create('b', team([agent()]), plan6());
      const done = await coordinator.execute(run, team([agent()]));
      expect(peakInFlight(log)).toBe(6);
      expect(done.status).toBe('completed');
    }
  });

  test('a cap of one serializes work and still unblocks dependents', async () => {
    const log: string[] = [];
    const store = new MemoryEventStore();
    const coordinator = new Coordinator(store, trackingExecutor(log), ok.run, approval().run, { maxConcurrency: 1 });
    const run = await coordinator.create('b', team([agent()]), [
      { title: 'A', kind: 'code', agentId: 'builder' },
      { title: 'B', kind: 'code', agentId: 'builder', dependsOn: [0] },
      { title: 'C', kind: 'code', agentId: 'builder' },
    ]);
    const done = await coordinator.execute(run, team([agent()]));
    expect(peakInFlight(log)).toBe(1);
    expect(log.indexOf('start:work-2')).toBeGreaterThan(log.indexOf('end:work-1'));
    expect(done.status).toBe('completed');
    expect(done.items.every(item => item.status === 'done')).toBe(true);
  });
});

describe('RunInput maxConcurrency threading into the Coordinator', () => {
  const planSteps = { steps: Array.from({ length: 6 }, (_, index) => ({ title: `Step ${index + 1}`, kind: 'code', agentId: 'builder' })) };
  const builderRole = { id: 'builder', label: 'Builder', detail: 'Builds code', kinds: ['code' as const], rank: 1, permissions: perms, avatarId: 1 };
  const profile = { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o', imageModel: '' };
  const plugins = { workspaceFiles: false, imageGeneration: true, codeReview: false, visualReview: false };
  // Routing markers: the ONLY coupling between this mock router and production prompt wording. Reviewers are
  // matched on their verdict-contract preamble and the planner on its preamble; the router guard below fails
  // loudly on an unmatched prompt instead of silently misrouting it to the builder reply (which would corrupt
  // the flight log these tests measure).
  const plannerMark = "Dispatch's task planner";
  const reviewerMark = '"passed":boolean';
  // Builder-call trace for the concurrency assertions. The router closes over this one stable holder and each
  // case resets .log, so no captured binding is ever reassigned mid-suite: fresh log per case, single closure.
  const flight = { log: [] as string[] };
  // Per-test replies routed by prompt shape: planner, reviewer(s), and builder each read their own knob.
  let planReply: string;
  let builderReply: string;

  beforeAll(() => {
    // model-runner reaches native persistence modules on import; only the coordinator path under test stays real.
    jest.doMock('../src/providers/openai-compatible', () => ({
      completeChat: jest.fn(async (_profile: unknown, chat: { content: string }[]) => {
        const system = String(chat?.[0]?.content ?? '');
        // The real contract returns content, usage and the model that served it. The
        // ledger row is written from this, so the stub must carry the same shape.
        const finish = (content: string) => ({
          content,
          usage: { promptTokens: 120, completionTokens: 45, totalTokens: 165, basis: 'exact' as const },
          model: 'mock-model',
        });
        if (system.includes(plannerMark)) return finish(planReply);
        if (system.includes(reviewerMark)) return finish(JSON.stringify({ passed: true, findings: [] }));
        if (!system.includes('a member of an AI team') && !system.includes('the visual designer')) throw new Error(`The mock router matched no preamble; update plannerMark/reviewerMark: ${system.slice(0, 60)}`);
        flight.log.push('start');
        await new Promise<void>(resolve => { setTimeout(resolve, 5); });
        flight.log.push('end');
        return finish(builderReply);
      }),
      generateImage: jest.fn(async () => 'BASE64'),
    }));
    jest.doMock('../src/persistence/runStore', () => ({
      saveRunSnapshot: jest.fn(async () => undefined),
      PersistentRunEventStore: class { async append(event: unknown) { return event; } read() { return []; } },
    }));
    jest.doMock('../src/persistence/workspaceProject', () => ({
      readDesignReferenceImage: jest.fn(async () => undefined),
      readProjectText: jest.fn(async () => ''),
      listProjectFiles: jest.fn(async () => []),
      applyProjectFile: jest.fn(async () => undefined),
      grepProjectText: jest.fn(async () => ''),
      saveGeneratedImage: jest.fn(async () => 'image://saved'),
    }));
  });

  beforeEach(() => { flight.log = []; planReply = JSON.stringify(planSteps); builderReply = JSON.stringify({ summary: 'done' }); jest.clearAllMocks(); });

  function peakInFlight(log: string[]): number {
    let inFlight = 0;
    let peak = 0;
    for (const entry of log) {
      if (entry === 'start') peak = Math.max(peak, inFlight += 1);
      else inFlight -= 1;
    }
    return peak;
  }

  async function runWith(maxConcurrency?: number): Promise<{ run: Run; items: number }> {
    const modelRunner = require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner');
    const shared = { roles: [builderRole], teamId: 'team-1', planningDebate: false, checkpointPolicy: 'plan-only' as const, maxConcurrency, plugins, profile, projectRoot: '', reviewCode: false, reviewImages: false, onUpdate: () => undefined };
    const planned = await modelRunner.createPlannedRun({ ...shared, brief: 'Ship the feature.' });
    const run = await modelRunner.executePlannedRun({ ...shared, run: planned });
    return { run, items: planned.items.length };
  }

  test('forwards the cap from RunInput through plan creation and execution', async () => {
    const { run, items } = await runWith(2);
    expect(items).toBe(6);
    expect(run.status).toBe('completed');
    expect(run.items.every(item => item.status === 'done')).toBe(true);
    expect(peakInFlight(flight.log)).toBe(2);
  });

  test('treats a zero or omitted cap as unlimited', async () => {
    for (const cap of [undefined, 0]) {
      flight.log = [];
      const { run } = await runWith(cap);
      expect(run.status).toBe('completed');
      expect(peakInFlight(flight.log)).toBe(6);
    }
  });

  describe('review and approval gates over the real ModelRunReviewer', () => {
    const gateTeam = [
      { id: 'builder', label: 'Builder', detail: 'Builds code', kinds: ['code' as const, 'image' as const], rank: 2, permissions: perms, avatarId: 1 },
      { id: 'reviewer', label: 'Lead', detail: 'Reviews code', kinds: ['code' as const, 'review' as const], rank: 5, permissions: perms, avatarId: 2 },
    ];
    const gateProfile = { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o', imageModel: 'gpt-image-1' };
    const gatePlugins = { workspaceFiles: false, imageGeneration: true, codeReview: true, visualReview: true };
    const codeStep = [{ title: 'Add the config file', kind: 'code' as const, agentId: 'builder' }];
    const imageStep = [{ title: 'Draw the hero banner', kind: 'image' as const, agentId: 'builder' }];
    const cleanProposal = JSON.stringify({ summary: 'Added the port setting.', messages: [{ to: 'team', kind: 'handoff', text: 'Config staged for review.' }], changes: [{ path: 'src/config.ts', content: 'export const port = 8080;\n' }] });
    const secretProposal = JSON.stringify({ summary: 'Added the API key.', messages: [{ to: 'team', kind: 'handoff', text: 'Config staged for review.' }], changes: [{ path: 'src/config.ts', content: 'const apiKey = "sk-live-abcdef";\nexport default apiKey;\n' }] });

    async function runGate(options: { plan: { title: string; kind: 'code' | 'image'; agentId: string }[]; builder: string; reviewCode: boolean; reviewImages: boolean; plugins?: typeof gatePlugins; projectRoot?: string; onUpdate?: (run: Run) => void }) {
      const modelRunner = require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner');
      planReply = JSON.stringify({ steps: options.plan });
      builderReply = options.builder;
      const shared = { roles: gateTeam, teamId: 'gate-team', planningDebate: false, checkpointPolicy: 'plan-only' as const, plugins: options.plugins ?? gatePlugins, profile: gateProfile, projectRoot: options.projectRoot ?? 'Z:/gate-demo', reviewCode: options.reviewCode, reviewImages: options.reviewImages, onUpdate: options.onUpdate ?? (() => undefined) };
      const planned = await modelRunner.createPlannedRun({ ...shared, brief: 'Ship the feature.' });
      return modelRunner.executePlannedRun({ ...shared, run: planned });
    }

    // A code agent that keeps requesting tools is the dominant spend path in the whole app:
    // up to nine tool rounds plus a final summary call. Every one of those is a real
    // provider request, so every one of them owes the ledger a row.
    test('a code agent tool loop records one usage row per provider call, including the final round', async () => {
      await clearUsage();
      const chat = jest.requireMock('../src/providers/openai-compatible') as { completeChat: jest.Mock };
      chat.completeChat.mockClear();

      // A reply that always carries a tool call keeps the loop spinning to its bound.
      const toolDrivenBuilder = JSON.stringify({ toolCalls: [{ name: 'read_file', path: 'src/config.ts' }] });
      await runGate({
        plan: codeStep,
        builder: toolDrivenBuilder,
        reviewCode: false,
        reviewImages: false,
        plugins: { ...gatePlugins, workspaceFiles: true },
      });

      const rows = await readUsage();
      // 1 planning call (makePlan, runId null) + 9 tool rounds + 1 final summary = 11.
      expect(chat.completeChat).toHaveBeenCalledTimes(11);
      expect(rows).toHaveLength(11);

      const planning = rows.filter(row => row.phase === 'plan');
      expect(planning).toHaveLength(1);
      expect(planning[0].runId).toBeNull();

      const runRows = rows.filter(row => row.phase === 'run');
      expect(runRows).toHaveLength(10);
      // Every run row carries real identity, and none of them is the planner's null.
      for (const row of runRows) {
        expect(row.runId).toBeTruthy();
        expect(row.agentId).toBe('builder');
        expect(row.totalTokens).toBeGreaterThan(0);
      }
      // No provider call may go unrecorded, and none may be recorded twice.
      expect(new Set(runRows.map(row => row.at)).size).toBe(10);
    });

    // The usage screen tells the user image calls are not counted. This pins the BEHAVIOUR,
    // not the sentence: every recorded row must correspond to a chat call, and the image
    // request itself must contribute none.
    test('an image step records only its chat call and no row for the image request', async () => {
      await clearUsage();
      const provider = jest.requireMock('../src/providers/openai-compatible') as { completeChat: jest.Mock; generateImage: jest.Mock };
      provider.completeChat.mockClear();
      provider.generateImage.mockClear();

      await runGate({
        plan: imageStep,
        builder: JSON.stringify({ summary: 'A finished pass.', messages: [] }),
        reviewCode: false,
        reviewImages: false,
      });

      expect(provider.generateImage).toHaveBeenCalledTimes(1);
      const rows = await readUsage();
      // One planning call plus one builder chat call; the image generation wrote nothing.
      expect(provider.completeChat).toHaveBeenCalledTimes(2);
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(row.model).toBe('mock-model');
    });

    test('gate off: clean proposals pass with no verdict; a secret proposal is still gated above the early return', async () => {
      const offCases: { reviewCode: boolean; plugins: typeof gatePlugins; builder: string; gated: boolean }[] = [
        { reviewCode: false, plugins: gatePlugins, builder: cleanProposal, gated: false },
        { reviewCode: true, plugins: { ...gatePlugins, codeReview: false }, builder: cleanProposal, gated: false },
        // The Code review plugin off with review on cannot wave a secret proposal through:
        // the scan sits above the review-off early return in ModelRunReviewer.
        { reviewCode: true, plugins: { ...gatePlugins, codeReview: false }, builder: secretProposal, gated: true },
      ];
      for (const { builder, gated, ...knobs } of offCases) {
        const run = await runGate({ plan: codeStep, builder, reviewImages: false, ...knobs });
        expect(run.status).toBe(gated ? 'needs-approval' : 'completed');
        expect(run.items[0].status).toBe(gated ? 'needs-approval' : 'done');
        expect(run.changes?.find(candidate => candidate.path === 'src/config.ts')?.appliedAt).toBeUndefined();
        if (gated) expect(run.messages.some(message => message.text.includes('Secrets scan') && message.text.includes('src/config.ts:1'))).toBe(true);
      }
    });

    test('gate on: a hardcoded api_key fails review and is never auto-applied', async () => {
      const run = await runGate({ plan: codeStep, builder: secretProposal, reviewCode: true, reviewImages: false });
      expect(run.status).toBe('needs-approval');
      expect(run.items[0].status).toBe('needs-approval');
      expect(run.changes?.some(change => change.appliedAt)).toBe(false);
      const findings = run.messages.filter(message => message.text.includes('Secrets scan'));
      expect(findings.some(message => message.text.includes('src/config.ts:1'))).toBe(true);
    });

    test('the secret scan sits above the review-off early return: reviewCode:false still gates an api_key proposal', async () => {
      const run = await runGate({ plan: codeStep, builder: secretProposal, reviewCode: false, reviewImages: false });
      expect(run.status).toBe('needs-approval');
      expect(run.items[0].status).toBe('needs-approval');
      expect(run.changes?.every(change => !change.appliedAt)).toBe(true);
      expect(run.messages.some(message => message.text.includes('Secrets scan') && message.text.includes('src/config.ts:1'))).toBe(true);
    });

    test('the gate flags the passwd and secret spellings, not only api_key', async () => {
      // The pure scanSecrets tests cover the regex; these pin the reviewer-level gate path over the same spellings.
      for (const [pattern, content] of [['passwd', 'const passwd = "x";\n'], ['secret', 'const secret = "x";\n']] as const) {
        const builder = JSON.stringify({ summary: 'Added the setting.', messages: [{ to: 'team', kind: 'handoff', text: 'Config staged for review.' }], changes: [{ path: 'src/config.ts', content }] });
        const run = await runGate({ plan: codeStep, builder, reviewCode: true, reviewImages: false });
        expect(run.status).toBe('needs-approval');
        expect(run.items[0].status).toBe('needs-approval');
        expect(run.changes?.every(change => !change.appliedAt)).toBe(true);
        expect(run.messages.some(message => message.text.includes(`possible hardcoded ${pattern} assignment`))).toBe(true);
      }
    });

    test('image pixels: review passes on cached pixels and fails closed when they are unavailable', async () => {
      const brief = 'A calm hero banner over a harbor at dusk.';
      const hit = await runGate({ plan: imageStep, builder: brief, reviewCode: false, reviewImages: true });
      expect(hit.status).toBe('completed');
      expect(hit.items[0].status).toBe('done');
      expect(hit.artifacts.some(artifact => artifact.kind === 'image')).toBe(true);

      const miss = await runGate({ plan: imageStep, builder: brief, reviewCode: false, reviewImages: true, onUpdate: snapshot => { if (snapshot.artifacts.some(artifact => artifact.kind === 'image')) clearGeneratedImages(); } });
      expect(miss.status).toBe('needs-approval');
      expect(miss.items[0].status).toBe('needs-approval');
      expect(miss.messages.some(message => message.text.includes('pixels are unavailable'))).toBe(true);
    });

    test('peer apply: a passing peer review applies the change and stamps appliedAt and approvedBy', async () => {
      const run = await runGate({ plan: codeStep, builder: cleanProposal, reviewCode: true, reviewImages: false });
      expect(run.status).toBe('completed');
      expect(run.items[0].status).toBe('done');
      const change = run.changes?.find(candidate => candidate.path === 'src/config.ts');
      expect(change?.appliedAt).toBeTruthy();
      expect(change?.approvedBy).toBe('Lead');
      const workspace = require('../src/persistence/workspaceProject') as { applyProjectFile: jest.Mock };
      expect(workspace.applyProjectFile).toHaveBeenCalledWith('Z:/gate-demo', 'src/config.ts', '', 'export const port = 8080;\n', true);
    });

    test('a later review of the same item skips an already-applied change instead of re-applying it', async () => {
      const workspace = require('../src/persistence/workspaceProject') as { applyProjectFile: jest.Mock };
      const modelRunner = require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner');
      // A peer-applied attempt-1 change re-presented beside a fresh attempt-2 proposal, as the revision cycle leaves it.
      const run: Run = {
        id: 'run-1', brief: 'Ship the feature.', status: 'running', teamId: 'gate-team',
        items: [{ id: 'work-1', title: 'Add the config files', kind: 'code', agentId: 'builder', dependsOn: [], status: 'running', artifactIds: [] }],
        messages: [], artifacts: [],
        changes: [
          { id: 'change-1', itemId: 'work-1', path: 'src/one.ts', before: '', after: 'export const one = 1;\n', createOnly: true, createdBy: 'Builder', attempt: 1, appliedAt: 'applied-earlier', approvedBy: 'Lead' },
          { id: 'change-2', itemId: 'work-1', path: 'src/two.ts', before: '', after: 'export const two = 2;\n', createOnly: true, createdBy: 'Builder', attempt: 2 },
        ],
        createdAt: 't0', updatedAt: 't0',
      };
      const verdict = await new modelRunner.ModelRunReviewer(gateProfile, team([agent(), agent({ id: 'reviewer', name: 'Lead', rank: 5, kinds: ['code', 'review'] })]), true, false, 'Z:/gate-demo', gatePlugins, true).review({ run, item: run.items[0] });
      expect(verdict.passed).toBe(true);
      // Only the fresh proposal reaches the apply path: no second applyProjectFile call for the applied change.
      expect(workspace.applyProjectFile).toHaveBeenCalledTimes(1);
      expect(workspace.applyProjectFile).toHaveBeenCalledWith('Z:/gate-demo', 'src/two.ts', '', 'export const two = 2;\n', true);
      // Its original stamp and approver stand: no duplicate appliedAt stamp on a re-presented change.
      expect(run.changes?.find(change => change.id === 'change-1')).toMatchObject({ appliedAt: 'applied-earlier', approvedBy: 'Lead' });
      expect(run.changes?.find(change => change.id === 'change-2')?.appliedAt).toBeTruthy();
    });

    test('peer approval without a project folder refuses to apply and holds the item for a human', async () => {
      const workspace = require('../src/persistence/workspaceProject') as { applyProjectFile: jest.Mock };
      const run = await runGate({ plan: codeStep, builder: cleanProposal, reviewCode: true, reviewImages: false, projectRoot: '' });
      expect(run.status).toBe('needs-approval');
      expect(run.items[0].status).toBe('needs-approval');
      expect(run.changes?.every(change => !change.appliedAt)).toBe(true);
      expect(workspace.applyProjectFile).not.toHaveBeenCalled();
      // The reviewer's refusal finding reaches the human through the revision-request message.
      expect(run.messages.some(message => message.text.includes('no project folder is available to apply it'))).toBe(true);
    });

    test('a mid-batch apply failure reports the files already applied and holds the rest for a human', async () => {
      const workspace = require('../src/persistence/workspaceProject') as { applyProjectFile: jest.Mock };
      workspace.applyProjectFile.mockImplementation(async (_root: string, path: string) => { if (path === 'src/two.ts') throw new Error('The project file is locked by another process.'); });
      try {
        const builder = JSON.stringify({ summary: 'Added both settings.', messages: [{ to: 'team', kind: 'handoff', text: 'Config staged for review.' }], changes: [{ path: 'src/one.ts', content: 'export const one = 1;\n' }, { path: 'src/two.ts', content: 'export const two = 2;\n' }] });
        const run = await runGate({ plan: codeStep, builder, reviewCode: true, reviewImages: false });
        expect(run.status).toBe('needs-approval');
        expect(run.items[0].status).toBe('needs-approval');
        expect(run.changes?.some(change => change.path === 'src/one.ts' && change.appliedAt)).toBe(true);
        expect(run.changes?.some(change => change.path === 'src/two.ts' && change.appliedAt)).toBe(false);
        expect(run.messages.some(message => message.from === 'Lead' && message.text.includes('could not be safely applied') && message.text.includes('These earlier files were applied: src/one.ts'))).toBe(true);
      } finally {
        workspace.applyProjectFile.mockImplementation(async () => undefined);
      }
    });

    test('the human apply path refuses a flagged change, quoting path:line, and allows a clean one', () => {
      const modelRunner = require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner');
      const blocked = modelRunner.codeApplySecretBlock({ path: 'src/config.ts', after: 'const apiKey = "sk-live-abcdef";\nexport default apiKey;\n' });
      expect(blocked).toContain('src/config.ts:1');
      expect(blocked).toContain('apikey');
      expect(modelRunner.codeApplySecretBlock({ path: 'src/config.ts', after: 'export const port = 8080;\n' })).toBeNull();
    });
  });

  // The policy is stamped onto the run at plan time, and the coordinator reads it from the run, so an approve-time
  // flip has to reach executePlannedRun and land on the run — exactly like maxConcurrency above.
  describe('checkpointPolicy flipping across the approve boundary', () => {
    const chainSteps = { steps: [
      { title: 'Step 1', kind: 'code', agentId: 'builder' },
      { title: 'Step 2', kind: 'code', agentId: 'builder', dependsOn: [0] },
      { title: 'Step 3', kind: 'code', agentId: 'builder', dependsOn: [1] },
    ] };
    const chainRole = { id: 'builder', label: 'Builder', detail: 'Builds code', kinds: ['code' as const], rank: 1, permissions: perms, avatarId: 1 };
    const chainProfile = { endpoint: 'https://api.openai.com/v1', model: 'gpt-4o', imageModel: '' };
    const chainPlugins = { workspaceFiles: false, imageGeneration: false, codeReview: false, visualReview: false };
    const chainShared = { roles: [chainRole], teamId: 'team-1', planningDebate: false, plugins: chainPlugins, profile: chainProfile, projectRoot: '', reviewCode: false, reviewImages: false, onUpdate: () => undefined };

    beforeAll(() => { planReply = JSON.stringify(chainSteps); builderReply = JSON.stringify({ summary: 'done' }); });
    // The outer beforeEach resets planReply to the six-item concurrency plan, so re-stamp ours for every case.
    beforeEach(() => { planReply = JSON.stringify(chainSteps); });

    /** Three dependent steps give two waves; a checkpoint pause can only land between them. */
    async function planThenApprove(stamped: 'plan-only' | 'each-wave', approved?: 'plan-only' | 'each-wave') {
      const modelRunner = require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner');
      const planned = await modelRunner.createPlannedRun({ ...chainShared, checkpointPolicy: stamped, brief: 'Ship the feature.' });
      expect(planned.checkpointPolicy).toBe(stamped);
      return modelRunner.executePlannedRun({ ...chainShared, checkpointPolicy: approved, run: planned });
    }

    test('flipping plan-only to each-wave before approving pauses after the first wave', async () => {
      const paused = await planThenApprove('plan-only', 'each-wave');
      expect(paused.status).toBe('needs-approval');
      expect(paused.checkpointPaused).toBe(true);
      expect(paused.checkpointPolicy).toBe('each-wave');
      expect(paused.items.filter(item => item.status === 'done')).toHaveLength(1);
      expect(paused.items[1].status).toBe('ready');
      const resumed = await (require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner')).executePlannedRun({ ...chainShared, checkpointPolicy: 'each-wave', run: paused });
      // Approving clears the pause, runs wave 2, then pauses again at the next checkpoint.
      expect(resumed.status).toBe('needs-approval');
      expect(resumed.items.filter(item => item.status === 'done')).toHaveLength(2);
      const finished = await (require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner')).executePlannedRun({ ...chainShared, checkpointPolicy: 'each-wave', run: resumed });
      expect(finished.status).toBe('completed');
      expect(finished.checkpointPaused).toBeFalsy();
      expect(finished.items.every(item => item.status === 'done')).toBe(true);
    });

    test('flipping each-wave to plan-only before approving completes without a pause', async () => {
      const completed = await planThenApprove('each-wave', 'plan-only');
      expect(completed.status).toBe('completed');
      expect(completed.checkpointPaused).toBeFalsy();
      expect(completed.items.every(item => item.status === 'done')).toBe(true);
    });

    test('an omitted checkpointPolicy keeps the policy stamped at plan time', async () => {
      const modelRunner = require('../src/orchestration/model-runner') as typeof import('../src/orchestration/model-runner');
      const stampedRun = { ...chainShared, checkpointPolicy: 'each-wave' as const };
      const planned = await modelRunner.createPlannedRun({ ...stampedRun, brief: 'Ship the feature.' });
      const run = await modelRunner.executePlannedRun({ ...stampedRun, run: planned });
      expect(run.status).toBe('needs-approval');
      expect(run.checkpointPaused).toBe(true);
    });
  });
});
