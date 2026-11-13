/**
 * Headless regression suite for the settings reader.
 *
 * Load-bearing rule under test: peer auto-apply — which lets a higher-ranked agent write files to
 * the project folder with no human in the path (model-runner.ts:417-434) — must be armed ONLY by
 * an explicit stored `true`. Settings blobs written by versions 1-3 never carried the field, and
 * those versions are still accepted, so an absent field means "never saw the option", not
 * "consented". `!== false` cannot tell those apart and silently armed every upgraded install.
 */

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

import { readWorkspaceSettings } from '../src/persistence/workspace';

const base = { teams: [], agentMemories: {}, agentMemory: {}, customRoles: [], workflows: [] };

function read(value: Record<string, unknown>) {
  return readWorkspaceSettings(value);
}

describe('readWorkspaceSettings', () => {
  it('arms peer auto-apply for an explicit true, and only for it', () => {
    expect(read({ ...base, version: 4, peerApprovalEnabled: true }).peerApprovalEnabled).toBe(true);
    expect(read({ ...base, version: 4, peerApprovalEnabled: false }).peerApprovalEnabled).toBe(false);
  });

  it('leaves peer auto-apply OFF when the field is absent, as in every version 1-3 blob', () => {
    for (const version of [1, 2, 3, 4]) {
      expect([version, read({ ...base, version }).peerApprovalEnabled]).toEqual([version, false]);
    }
  });

  it('treats a non-boolean value as absent rather than as consent', () => {
    for (const bogus of ['true', 'yes', 1, 0, {}, []]) {
      expect([JSON.stringify(bogus), read({ ...base, version: 4, peerApprovalEnabled: bogus }).peerApprovalEnabled])
        .toEqual([JSON.stringify(bogus), false]);
    }
  });

  it('leaves plan approval OFF unless an explicit true is stored, like peer auto-apply', () => {
    for (const version of [1, 2, 3, 4]) {
      expect([version, read({ ...base, version }).requirePlanApproval]).toEqual([version, false]);
    }
    expect(read({ ...base, version: 4, requirePlanApproval: true }).requirePlanApproval).toBe(true);
    for (const bogus of ['true', 1, {}]) {
      expect(read({ ...base, version: 4, requirePlanApproval: bogus }).requirePlanApproval).toBe(false);
    }
  });

  it('falls back to safe defaults for an unknown version or a non-object blob', () => {
    for (const blob of [{ ...base, version: 99 }, { ...base, version: 0 }, null, undefined, 'a string', 42, []]) {
      expect(readWorkspaceSettings(blob as unknown).peerApprovalEnabled).toBe(false);
    }
  });

  it('still honours an explicit true written by a version 4 blob with other fields present', () => {
    const migrated = read({
      version: 4,
      ...base,
      planningDebate: true,
      checkpointPolicy: 'each-wave',
      maxConcurrency: 3,
      peerApprovalEnabled: true,
    });
    expect([migrated.peerApprovalEnabled, migrated.planningDebate, migrated.checkpointPolicy, migrated.maxConcurrency])
      .toEqual([true, true, 'each-wave', 3]);
  });

  it('keeps each agent folder and idle behaviour, and drops an unusable folder name', () => {
    const settings = read({
      version: 4,
      ...base,
      agentSetups: {
        builder: { folder: 'Builder Work', idle: 'picture' },
        reviewer: { folder: '../escape', idle: 'report' },
        broken: { folder: '', idle: 'anything' },
      },
    });
    expect(settings.agentSetups.builder).toEqual({ folder: 'Builder Work', idle: 'picture' });
    // The folder is refused but the idle behaviour is still the agent's.
    expect(settings.agentSetups.reviewer).toEqual({ folder: '', idle: 'report' });
    // An entry with nothing in it is not a setting.
    expect(settings.agentSetups.broken).toBeUndefined();
  });

  it('falls back to the free choice for an idle behaviour it does not know', () => {
    const settings = read({ version: 4, ...base, agentSetups: { builder: { folder: 'Work', idle: 'nonsense' } } });
    expect(settings.agentSetups.builder).toEqual({ folder: 'Work', idle: 'anything' });
  });

  it('reads the always-on fields, and only accepts an explicit true', () => {
    const on = read({ version: 4, ...base, alwaysOn: true, alwaysOnAgentId: 'builder', alwaysOnMinutes: 12 });
    expect([on.alwaysOn, on.alwaysOnAgentId, on.alwaysOnMinutes]).toEqual([true, 'builder', 12]);
    const off = read({ version: 4, ...base, alwaysOn: 'yes', alwaysOnAgentId: 42, alwaysOnMinutes: 0 });
    expect([off.alwaysOn, off.alwaysOnAgentId, off.alwaysOnMinutes]).toEqual([false, '', 5]);
  });

  it('keeps the provider an agent brings, but never a key', () => {
    const settings = read({
      version: 4,
      ...base,
      agentProviders: { builder: { endpoint: 'https://own.test/v1', model: 'own-model', imageModel: '', ownKey: true, apiKey: 'sk-should-never-be-here' } },
    });
    expect(settings.agentProviders.builder).toEqual({ endpoint: 'https://own.test/v1', model: 'own-model', imageModel: '', ownKey: true });
    expect(JSON.stringify(settings.agentProviders)).not.toContain('sk-should-never-be-here');
  });
});