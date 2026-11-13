import { TurboModuleRegistry } from 'react-native';
import type { TurboModule } from 'react-native';

/**
 * The system clipboard.
 *
 * React Native Windows already ships the module: `Microsoft.ReactNative/Modules/ClipboardModule.cpp`
 * registers a TurboModule named `Clipboard` with `getString` and `setString`, and the runtime
 * hands it out through the TurboModule proxy. React Native's own `Clipboard` export is deprecated
 * and warns every time it is touched, so the module is asked for directly instead.
 *
 * The lookup is `get`, not `getEnforcing`: a runtime without the module is a runtime where the
 * copy button does nothing, not a runtime that crashes on load.
 */
export interface ClipboardSpec extends TurboModule {
  setString(content: string): void;
}

/** Writes text to the system clipboard. Returns false when there is no clipboard to write to. */
export function copyText(text: string): boolean {
  const clipboard = TurboModuleRegistry.get<ClipboardSpec>('Clipboard');
  if (!clipboard) return false;
  try {
    clipboard.setString(text);
    return true;
  } catch {
    return false;
  }
}
