import AsyncStorage from '@react-native-async-storage/async-storage';

const PROFILE_KEY = 'dispatch.provider.profile.v1';
export type ProviderProfile = { endpoint: string; model: string; imageModel: string };
export const defaultProviderProfile: ProviderProfile = { endpoint: 'https://api.openai.com/v1', model: '', imageModel: '' };

export async function loadProviderProfile(): Promise<ProviderProfile> {
  const raw = await AsyncStorage.getItem(PROFILE_KEY);
  if (!raw) return defaultProviderProfile;
  try {
    const value = JSON.parse(raw) as Partial<ProviderProfile>;
    return { endpoint: typeof value.endpoint === 'string' ? value.endpoint : defaultProviderProfile.endpoint, model: typeof value.model === 'string' ? value.model : '', imageModel: typeof value.imageModel === 'string' ? value.imageModel : '' };
  } catch { return defaultProviderProfile; }
}

export async function saveProviderProfile(profile: ProviderProfile): Promise<void> {
  await AsyncStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
