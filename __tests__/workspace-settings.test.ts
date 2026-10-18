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
});