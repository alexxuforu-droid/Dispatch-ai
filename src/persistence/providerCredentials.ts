import { Platform } from 'react-native';
import DispatchVault from '../NativeDispatchVault';

/** The workspace key. One provider profile, one credential, for everything that has no own key. */
export const WORKSPACE_SECRET_ID = 'openai-compatible';

/**
 * The credential slot one agent's own key lives in.
 *
 * The agent id is part of the name, so two agents on two providers never read each other's
 * key, and removing an agent can remove exactly its own slot.
 */
export const agentSecretId = (agentId: string): string => `agent:${agentId}`;

export async function hasProviderSecret(providerId: string): Promise<boolean> {
  if (Platform.OS !== 'windows') return false;
  if (!DispatchVault) throw new Error('Windows Credential Locker is unavailable in this app build.');
  return DispatchVault.hasSecret(providerId);
}

export async function saveProviderSecret(providerId: string, secret: string): Promise<void> {
  if (Platform.OS !== 'windows') throw new Error('Secure provider credentials are currently available on Windows only.');
  if (!DispatchVault) throw new Error('Windows Credential Locker is unavailable in this app build.');
  await DispatchVault.setSecret(providerId, secret.trim());
}

export async function loadProviderSecret(providerId: string): Promise<string> {
  if (Platform.OS !== 'windows') return '';
  if (!DispatchVault) throw new Error('Windows Credential Locker is unavailable in this app build.');
  return DispatchVault.getSecret(providerId);
}

export async function clearProviderSecret(providerId: string): Promise<void> {
  if (Platform.OS !== 'windows') throw new Error('Secure provider credentials are currently available on Windows only.');
  if (!DispatchVault) throw new Error('Windows Credential Locker is unavailable in this app build.');
  await DispatchVault.clearSecret(providerId);
}
