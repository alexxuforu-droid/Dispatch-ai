/**
 * The extracted controllers, driven directly.
 *
 * These are the app's decisions with no renderer in the way: the plan creator is a fake, the
 * executor is a fake, and the file write is a fake. That is the point of lifting them out of
 * App.tsx — whether a run may start, which policy it executes under, and whether a proposal may
 * be written are now checkable on their own.
 *
 * There is no renderer in this file on purpose. If a decision could only be reached through a
 * rendered tree, it had not really been extracted.
 */
import { applyCodeChange, undoCodeChange } from '../src/app/controllers/applyController';
import { approvePlan, canApprovePlan, configureRoles, startRun, startRunRefusal } from '../src/app/controllers/runController';
import { ExecuteRunInput, PlanRunInput } from '../src/app/controllers/types';
import { Role } from '../src/app/types';
import { Run } from '../src/orchestration/types';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

const role: Role = { id: 'builder', label: 'Builder', detail: 'Creates code outputs.', glyph: 'build', kinds: ['code'] };

const agents = {
  agentModels: { builder: 'test-model' },
  agentAvatars: { builder: 7 },
  agentPermissions: {},
  agentRanks: { builder: 3 },
  agentMemory: { builder: 'remember this' },
};

const profile = { endpoint: 'https://example.test/v1', model: 'test-model', imageModel: '' };

const live = {
  peerApprovalEnabled: true,
  plugins: { workspaceFiles: true, imageGeneration: false, codeReview: true, visualReview: false },
  reviewCode: true,
  reviewImages: true,
  maxConcurrency: 4,
};

const snapshot = {
  peerApprovalEnabled: false,
  plugins: { workspaceFiles: false, imageGeneration: false, codeReview: false, visualReview: false },
  reviewCode: false,
  reviewImages: false,
  maxConcurrency: 1,
};

function makeRun(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    brief: 'Ship the feature',
    status: 'queued',
    teamId: 'team-default',
    items: [{ id: 'item-1', title: 'Write it', kind: 'code', agentId: 'builder', dependsOn: [], status: 'done', artifactIds: [] }],
    messages: [],
    artifacts: [],
    changes: [{ id: 'change-1', itemId: 'item-1', path: 'src/feature.ts', before: 'old\n', after: 'new\n', createOnly: false, createdBy: 'builder', attempt: 1 }],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('the run controller', () => {
  it('plans the trimmed brief with the configured roles', async () => {
    const planned = makeRun();
    let seen: PlanRunInput | null = null;
    const result = await startRun({
      brief: '  Ship the feature  ',
      roles: [role],
      busy: false,
      providerReady: true,
      live,
      checkpointPolicy: 'plan-only',
      planningDebate: false,
      agents,
      profile,
      projectRoot: 'C:\\work',
      signal: new AbortController().signal,
      plan: async input => { seen = input; return planned; },
      onPlanned: () => undefined,
      onUpdate: () => undefined,
    });

    expect(result).toEqual({ outcome: 'started', run: planned });
    expect(seen).not.toBeNull();
    expect(seen!.brief).toBe('Ship the feature');
    expect(seen!.roles[0]).toMatchObject({ id: 'builder', modelId: 'test-model', avatarId: 7, rank: 3, memory: 'remember this' });
  });

  it('refuses to start without a team', async () => {
    const plan = jest.fn();
    const result = await startRun({
      brief: 'Ship the feature',
      roles: [],
      busy: false,
      providerReady: true,
      live,
      checkpointPolicy: 'plan-only',
      planningDebate: false,
      agents,
      profile,
      projectRoot: 'C:\\work',
      signal: new AbortController().signal,
      plan: plan as unknown as (input: PlanRunInput) => Promise<Run>,
      onPlanned: () => undefined,
      onUpdate: () => undefined,
    });

    expect(result).toEqual({ outcome: 'needs-team' });
    expect(plan).not.toHaveBeenCalled();
    expect(startRunRefusal({ brief: 'Ship the feature', roles: [], busy: false, providerReady: true })).toEqual({ outcome: 'needs-team' });
  });

  it('runs a planned run under the policy it was planned with', async () => {
    const run = makeRun({ policy: snapshot });
    const execute = jest.fn(async (input: ExecuteRunInput) => input.run);
    const result = await approvePlan({
      run,
      busy: false,
      live,
      checkpointPolicy: 'plan-only',
      roles: [role],
      agents,
      profile,
      projectRoot: 'C:\\work',
      signal: new AbortController().signal,
      execute,
      onUpdate: () => undefined,
    });

    expect(result).toEqual({ outcome: 'started', run });
    expect(execute).toHaveBeenCalledTimes(1);
    const input = execute.mock.calls[0][0];
    // The snapshot wins: the live toggles describe the next run, not this one.
    expect(input.reviewCode).toBe(false);
    expect(input.reviewImages).toBe(false);
    expect(input.peerApprovalEnabled).toBe(false);
    expect(input.maxConcurrency).toBe(1);
    expect(input.plugins).toEqual(snapshot.plugins);
    // The run itself is untouched, so the executor sees exactly what was saved.
    expect(input.run).toEqual(run);
  });

  it('follows the live settings for a run saved before the snapshot existed', async () => {
    const run = makeRun();
    expect(run.policy).toBeUndefined();
    const execute = jest.fn(async (input: ExecuteRunInput) => input.run);
    await approvePlan({
      run,
      busy: false,
      live,
      checkpointPolicy: 'plan-only',
      roles: [role],
      agents,
      profile,
      projectRoot: 'C:\\work',
      signal: new AbortController().signal,
      execute,
      onUpdate: () => undefined,
    });

    const input = execute.mock.calls[0][0];
    expect(input.reviewCode).toBe(true);
    expect(input.reviewImages).toBe(true);
    expect(input.peerApprovalEnabled).toBe(true);
    expect(input.maxConcurrency).toBe(4);
    expect(input.plugins).toEqual(live.plugins);
  });

  it('only approves a run that is waiting to start', () => {
    expect(canApprovePlan(makeRun({ status: 'queued' }), false)).toBe(true);
    expect(canApprovePlan(makeRun({ status: 'running' }), false)).toBe(false);
    expect(canApprovePlan(makeRun({ status: 'queued' }), true)).toBe(false);
    expect(canApprovePlan(null, false)).toBe(false);
  });

  it('gives every role the settings the workspace holds', () => {
    const configured = configureRoles([role], agents);
    expect(configured[0].avatarId).toBe(7);
    expect(configured[0].permissions).toEqual({ read: false, grep: false, write: false, edit: false });
  });
});

describe('the apply controller', () => {
  it('writes an eligible change and records it on the run', async () => {
    const run = makeRun();
    const writes: string[][] = [];
    const result = await applyCodeChange({
      run,
      changeId: 'change-1',
      projectRoot: 'C:\\work',
      applying: false,
      applyFile: async (root, path, expected, replacement) => { writes.push([root, path, expected, replacement]); },
    });

    expect(result.outcome).toBe('applied');
    expect(writes).toEqual([['C:\\work', 'src/feature.ts', 'old\n', 'new\n']]);
    if (result.outcome !== 'applied') throw new Error('expected the change to be applied');
    expect(result.run.changes?.[0].appliedAt).toBeTruthy();
  });

  it('refuses a change that carries a hardcoded secret', async () => {
    const run = makeRun({
      changes: [{ id: 'change-1', itemId: 'item-1', path: 'src/feature.ts', before: '', after: 'const apiKey = "sk-live-123";\n', createOnly: true, createdBy: 'builder', attempt: 1 }],
    });
    const applyFile = jest.fn();
    const result = await applyCodeChange({ run, changeId: 'change-1', projectRoot: 'C:\\work', applying: false, applyFile });

    expect(result.outcome).toBe('blocked');
    expect(applyFile).not.toHaveBeenCalled();
  });

  it('puts an applied change back the way it was', async () => {
    const run = makeRun({ changes: [{ id: 'change-1', itemId: 'item-1', path: 'src/feature.ts', before: 'old\n', after: 'new\n', createOnly: false, createdBy: 'builder', attempt: 1, appliedAt: '2026-01-02T00:00:00.000Z' }] });
    const writes: string[][] = [];
    const result = await undoCodeChange({
      run,
      changeId: 'change-1',
      projectRoot: 'C:\\work',
      applyFile: async (root, path, expected, replacement) => { writes.push([root, path, expected, replacement]); },
      removeFile: async () => undefined,
    });

    expect(result.outcome).toBe('undone');
    expect(writes).toEqual([['C:\\work', 'src/feature.ts', 'new\n', 'old\n']]);
    if (result.outcome !== 'undone') throw new Error('expected the change to be undone');
    expect(result.run.changes?.[0].revertedAt).toBeTruthy();
  });
});
