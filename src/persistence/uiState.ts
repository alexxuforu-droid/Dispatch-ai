import AsyncStorage from '@react-native-async-storage/async-storage';
import { Screen, pages } from '../app/types';

const SCREEN_KEY = 'dispatch.ui.screen.v1';

/**
 * The screen the app was left on. A stored value that is not a current page (an older
 * build's screen, a hand-edited blob) is treated as absent rather than trusted.
 */
export async function readLastScreen(): Promise<Screen | null> {
  try {
    const value = await AsyncStorage.getItem(SCREEN_KEY);
    return value && pages.some(page => page.id === value) ? (value as Screen) : null;
  } catch {
    return null;
  }
}

/** Best-effort: a screen that cannot be remembered is not worth failing over. */
export function saveLastScreen(screen: Screen): void {
  AsyncStorage.setItem(SCREEN_KEY, screen).catch(() => undefined);
}
