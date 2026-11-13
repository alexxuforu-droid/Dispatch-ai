import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  pickWorkspaceDirectory(): Promise<string>;
  listWorkspaceFiles(rootPath: string, relativePath: string): Promise<string>;
  readWorkspaceText(rootPath: string, relativePath: string, maxBytes: number): Promise<string>;
  grepWorkspaceText(rootPath: string, relativePath: string, query: string, maxResults: number): Promise<string>;
  applyWorkspaceFile(rootPath: string, relativePath: string, expectedText: string, replacementText: string, createOnly: boolean): Promise<string>;
  removeWorkspaceFile(rootPath: string, relativePath: string, expectedText: string): Promise<string>;
  ensureWorkspaceDirectory(rootPath: string, relativePath: string): Promise<string>;
  pickDesignReferenceImage(): Promise<string>;
  readDesignReferenceImage(uri: string): Promise<string>;
  saveGeneratedImage(base64Png: string, fileName: string): Promise<string>;
  saveExistingFileAs(sourcePath: string, suggestedName: string): Promise<string | null>;
  saveTextAs(text: string, suggestedName: string): Promise<string | null>;
}

export default TurboModuleRegistry.get<Spec>('DispatchWorkspace');
