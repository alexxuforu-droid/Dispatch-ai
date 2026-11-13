/**
 * Which provider one agent calls, and which credential slot that call reads.
 *
 * The key is never in the workspace file. What travels with the agent is the name of the
 * credential slot in Windows Credential Manager, so these tests check the slot, not a secret.
 */

import { hasOwnProvider, resolveAgentProfile } from '../src/orchestration/agentProvider';
import { agentSecretId, WORKSPACE_SECRET_ID } from '../src/persistence/providerCredentials';
import type { ProviderProfile } from '../src/persistence/providerProfile';

const base: ProviderProfile = { endpoint: 'https://workspace.test/v1', model: 'workspace-model', imageModel: 'workspace-image' };

describe('resolveAgentProfile', () => {
  it('gives an agent with nothing of its own the workspace profile', () => {
    expect(resolveAgentProfile(base, { id: 'builder', modelId: '', provider: undefined })).toEqual(base);
  });

  it('keeps the model id the agent already carries', () => {
    expect(resolveAgentProfile(base, { id: 'builder', modelId: 'agent-model', provider: undefined }).model).toBe('agent-model');
  });

  it('fills the blanks from the workspace and keeps what the agent set', () => {
    const resolved = resolveAgentProfile(base, {
      id: 'builder',
      modelId: '',
      provider: { endpoint: 'https://own.test/v1', model: 'own-model', imageModel: '', ownKey: false },
    });
    expect([resolved.endpoint, resolved.model, resolved.imageModel]).toEqual(['https://own.test/v1', 'own-model', 'workspace-image']);
    // No key of its own, so the workspace credential slot is the one it reads.
    expect(resolved.secretId).toBe(WORKSPACE_SECRET_ID);
  });

  it('points an agent with its own key at its own credential slot', () => {
    const resolved = resolveAgentProfile(base, {
      id: 'builder',
      modelId: '',
      provider: { endpoint: '', model: '', imageModel: '', ownKey: true },
    });
    expect(resolved.secretId).toBe(agentSecretId('builder'));
    expect(resolved.secretId).not.toBe(WORKSPACE_SECRET_ID);
  });

  it('never puts a key in the profile it hands back', () => {
    const resolved = resolveAgentProfile(base, {
      id: 'builder',
      modelId: '',
      provider: { endpoint: '', model: '', imageModel: '', ownKey: true },
    });
    expect(Object.keys(resolved)).not.toContain('apiKey');
    expect(JSON.stringify(resolved)).not.toContain('key');
  });
});

describe('hasOwnProvider', () => {
  it('is false for an empty provider and true for anything the agent brought', () => {
    expect(hasOwnProvider(undefined)).toBe(false);
    expect(hasOwnProvider({ endpoint: '', model: '', imageModel: '', ownKey: false })).toBe(false);
    expect(hasOwnProvider({ endpoint: '', model: '', imageModel: '', ownKey: true })).toBe(true);
    expect(hasOwnProvider({ endpoint: 'https://own.test/v1', model: '', imageModel: '', ownKey: false })).toBe(true);
  });
});
