import { AgentMessage, Artifact, CodeChange, Run, RunEvent, WorkItem } from './types';

/** Rebuilds visible run state from its immutable event log after a restart. */
export function replayRun(seed: Run, events: RunEvent[]): Run {
  const run: Run = { ...seed, items: seed.items.map(item => ({ ...item })), messages: [], artifacts: [], changes: [] };
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    if (event.runId !== run.id) continue;
    const payload = event.payload as Record<string, unknown>;
    run.changes ??= [];
    if (event.type === 'run.created' && !run.items.length && Array.isArray(payload.plan)) run.items = (payload.plan as WorkItem[]).map(item => ({ ...item }));
    if (event.type === 'run.status') {
      if (typeof payload.status === 'string') run.status = payload.status as Run['status'];
      run.checkpointPaused = payload.checkpointPaused === true || undefined;
      // The coordinator mutates run state after emitting (supersede/apply) and records it in these run.status flags: apply them so the log rebuilds the mutated state.
      if (Array.isArray(payload.supersededChangeIds)) for (const change of run.changes) if (payload.supersededChangeIds.includes(change.id) && !change.supersededAt) change.supersededAt = event.at;
      if (Array.isArray(payload.supersededArtifactIds)) for (const artifact of run.artifacts) if (payload.supersededArtifactIds.includes(artifact.id) && !artifact.supersededAt) artifact.supersededAt = event.at;
      if (Array.isArray(payload.appliedChanges)) for (const applied of payload.appliedChanges as CodeChange[]) {
        const index = run.changes.findIndex(change => change.id === applied.id);
        if (index >= 0) run.changes[index] = { ...run.changes[index], ...applied };
        else run.changes.push({ ...applied });
      }
    }
    if (event.type === 'work.ready' || event.type === 'work.started' || event.type === 'work.finished') {
      const item = payload.item as WorkItem | undefined;
      if (item) {
        const index = run.items.findIndex(candidate => candidate.id === item.id);
        if (index >= 0) run.items[index] = { ...item };
        else run.items.push({ ...item });
      }
    }
    if (event.type === 'agent.message') {
      const message = payload as unknown as AgentMessage;
      if (message?.id && !run.messages.some(entry => entry.id === message.id)) run.messages.push({ ...message });
    }
    if (event.type === 'artifact.created') {
      const artifact = payload as unknown as Artifact;
      if (artifact?.id && !run.artifacts.some(entry => entry.id === artifact.id)) run.artifacts.push({ ...artifact });
    }
    if (event.type === 'code-change.proposed') {
      const change = payload as unknown as CodeChange;
      if (change?.id && !run.changes.some(entry => entry.id === change.id)) run.changes.push({ ...change });
    }
    if (event.type === 'review.finding') {
      const id = `msg-replay-${event.seq}`;
      if (!run.messages.some(entry => entry.id === id)) {
        run.messages.push({ id, runId: run.id, workItemId: payload.itemId as string | undefined, attempt: payload.attempt as number | undefined, from: 'Automatic code reviewer', to: 'team', text: String(payload.finding ?? ''), kind: 'finding', createdAt: event.at });
      }
    }
    if (event.type === 'review.verdict') {
      // The reviewer verdict belongs in the log: without it the history shows that work was
      // reviewed but not what the reviewer decided.
      const id = `msg-replay-${event.seq}`;
      const passed = payload.passed === true;
      const findings = Array.isArray(payload.findings) ? payload.findings.filter((finding): finding is string => typeof finding === 'string') : [];
      if (!run.messages.some(entry => entry.id === id)) {
        run.messages.push({
          id, runId: run.id, workItemId: payload.itemId as string | undefined, attempt: payload.attempt as number | undefined,
          from: typeof payload.reviewer === 'string' ? payload.reviewer : 'Automatic code reviewer', to: 'team',
          text: passed ? 'Review passed.' : findings.join('\n') || 'Review did not pass. Human review is required.',
          kind: passed ? 'update' : 'finding', createdAt: event.at,
        });
      }
    }
    if (event.type === 'human.decision') {
      const id = `msg-replay-${event.seq}`;
      const action = String(payload.action ?? 'decided');
      const path = typeof payload.path === 'string' ? payload.path : '';
      const by = typeof payload.by === 'string' && payload.by ? payload.by : 'You';
      if (!run.messages.some(entry => entry.id === id)) {
        run.messages.push({ id, runId: run.id, from: by, to: 'team', text: `${by} ${action === 'undo' ? 'undid' : action === 'reject' ? 'rejected' : 'applied'} ${path || 'a proposed change'}.`, kind: 'update', createdAt: event.at });
      }
    }
    if (event.type === 'approval.required') {
      const item = run.items.find(candidate => candidate.id === payload.itemId);
      if (item && item.status !== 'done') item.status = 'needs-approval';
      const id = `msg-replay-${event.seq}`;
      if (!run.messages.some(entry => entry.id === id)) {
        run.messages.push({ id, runId: run.id, workItemId: payload.itemId as string | undefined, from: 'Dispatch', to: 'team', text: String(payload.reason ?? 'Human review is required.'), kind: 'finding', createdAt: event.at });
      }
    }
    run.updatedAt = event.at;
  }
  return run;
}
