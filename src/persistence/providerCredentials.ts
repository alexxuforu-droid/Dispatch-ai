import { Platform } from 'react-native';
import DispatchVault from '../NativeDispatchVault';

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
