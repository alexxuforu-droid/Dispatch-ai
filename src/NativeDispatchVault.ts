import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  hasSecret(providerId: string): Promise<boolean>;
  getSecret(providerId: string): Promise<string>;
  setSecret(providerId: string, secret: string): Promise<void>;
  clearSecret(providerId: string): Promise<void>;
}

export default TurboModuleRegistry.get<Spec>('DispatchVault');
