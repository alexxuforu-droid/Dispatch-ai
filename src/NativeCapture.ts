import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  listTargets(): Promise<string>;
  startCapture(hwndHex: string, processId: number, fps: number, maxEdge: number, jpegQuality: number): Promise<string>;
  nextFrame(afterSequence: number, timeoutMs: number): Promise<string>;
  stopCapture(): Promise<string>;
  startRecording(): Promise<string>;
  stopRecording(): Promise<string>;
  performAction(actionJson: string): Promise<string>;
}

export default TurboModuleRegistry.get<Spec>('DispatchCapture');
