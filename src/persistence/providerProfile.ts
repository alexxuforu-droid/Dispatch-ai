import AsyncStorage from '@react-native-async-storage/async-storage';
import { CorruptStorageError, StorageRead, preserveReadableSlot, readJsonSlot } from './storageSafety';

const PROFILE_KEY = 'dispatch.provider.profile.v1';
export type ProviderProfile = { endpoint: string; model: string; imageModel: string };
export const defaultProviderProfile: ProviderProfile = { endpoint: 'https://api.openai.com/v1', model: '', imageModel: '' };

/** Reads the profile with its corruption status, so "never configured" can be told from "lost". */
export async function loadProviderProfileResult(): Promise<StorageRead<ProviderProfile>> {
  return readJsonSlot<ProviderProfile>(PROFILE_KEY, raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new CorruptStorageError('the provider profile is not an object');
    const value = raw as Partial<ProviderProfile>;
    return { endpoint: typeof value.endpoint === 'string' ? value.endpoint : defaultProviderProfile.endpoint, model: typeof value.model === 'string' ? value.model : '', imageModel: typeof value.imageModel === 'string' ? value.imageModel : '' };
  }, defaultProviderProfile);
}

export async function loadProviderProfile(): Promise<ProviderProfile> {
  return (await loadProviderProfileResult()).value;
}

export async function saveProviderProfile(profile: ProviderProfile): Promise<void> {
  // A profile that cannot be read is kept aside before it is replaced.
  await preserveReadableSlot(PROFILE_KEY);
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
