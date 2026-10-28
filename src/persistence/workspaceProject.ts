import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import DispatchWorkspace from '../NativeWorkspace';

const PROJECT_KEY = 'dispatch.workspace.project.v1';
const MAX_TEXT_BYTES = 1024 * 1024;

export async function loadProjectRoot(): Promise<string> {
  return await AsyncStorage.getItem(PROJECT_KEY) ?? '';
}

export async function selectProjectFolder(): Promise<string> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('The native Windows folder picker is unavailable.');
  const selected = await DispatchWorkspace.pickWorkspaceDirectory();
  if (!selected) return '';
  await AsyncStorage.setItem(PROJECT_KEY, selected);
  return selected;
}

export async function listProjectFiles(rootPath: string, relativePath = ''): Promise<ProjectEntry[]> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('Native project file access is unavailable.');
  return JSON.parse(await DispatchWorkspace.listWorkspaceFiles(rootPath, relativePath)) as ProjectEntry[];
}

export async function readProjectText(rootPath: string, relativePath: string): Promise<string> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('Native project file access is unavailable.');
  return DispatchWorkspace.readWorkspaceText(rootPath, relativePath, MAX_TEXT_BYTES);
}

export async function grepProjectText(rootPath: string, relativePath: string, query: string): Promise<{ path: string; line: number; text: string }[]> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('Native project search is unavailable on this platform.');
  if (!query.trim()) throw new Error('Enter text to search for.');
  return JSON.parse(await DispatchWorkspace.grepWorkspaceText(rootPath, relativePath, query.trim().slice(0, 160), 60)) as { path: string; line: number; text: string }[];
}

export async function applyProjectFile(rootPath: string, relativePath: string, expectedText: string, replacementText: string, createOnly: boolean): Promise<string> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('Native project edits are unavailable on this platform.');
  return DispatchWorkspace.applyWorkspaceFile(rootPath, relativePath, expectedText, replacementText, createOnly);
}

export type ProjectFileChange = { path: string; before: string; after: string; createOnly?: boolean };

export type ApplyBatchResult = {
  /** True only when every file was written and the applied state was persisted. */
  ok: boolean;
  /** The files this attempt wrote. */
  written: string[];
  /** The files that were restored to their previous content. */
  rolledBack: string[];
  /** The first failure, with the path that failed and why. */
  failed: { path: string; message: string } | null;
};

/**
 * Applies every change of one proposal as a unit.
 *
 * Contract for the caller: `persistAppliedState` must durably record the applied state (the
 * run snapshot that carries `appliedAt`) before the UI shows the change as applied. The batch
 * reports `ok` only when every file was written AND that callback resolved; if the callback
 * throws, the written files are rolled back and the batch is not ok. The undo path therefore
 * exists before the UI can offer one, and a half-applied proposal is never left on disk.
 *
 * A file that cannot be restored during a rollback is reported in `written` and not in
 * `rolledBack`, so the caller can tell the user exactly what is still changed.
 */
export async function applyProjectChanges(rootPath: string, changes: ProjectFileChange[], persistAppliedState: () => Promise<void>): Promise<ApplyBatchResult> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('Native project edits are unavailable on this platform.');
  const workspace = DispatchWorkspace;
  const written: string[] = [];
  for (const change of changes) {
    try {
      await workspace.applyWorkspaceFile(rootPath, change.path, change.before, change.after, change.createOnly === true);
      written.push(change.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The file could not be written.';
      const rolledBack = await rollbackProjectChanges(rootPath, changes, written);
      return { ok: false, written, rolledBack, failed: { path: change.path, message } };
    }
  }
  try {
    await persistAppliedState();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The applied state could not be saved.';
    const rolledBack = await rollbackProjectChanges(rootPath, changes, written);
    return { ok: false, written, rolledBack, failed: { path: '', message } };
  }
  return { ok: true, written, rolledBack: [], failed: null };
}

/** Restores the files a failed batch had already written, newest first. */
async function rollbackProjectChanges(rootPath: string, changes: ProjectFileChange[], written: string[]): Promise<string[]> {
  const workspace = DispatchWorkspace;
  if (!workspace) return [];
  const rolledBack: string[] = [];
  for (const path of [...written].reverse()) {
    const change = changes.find(candidate => candidate.path === path);
    try {
      if (change?.createOnly) await workspace.removeWorkspaceFile(rootPath, path, change.after);
      else await workspace.applyWorkspaceFile(rootPath, path, change?.after ?? '', change?.before ?? '', false);
      rolledBack.push(path);
    } catch {
      // The file could not be restored: it stays in `written` so the caller can say so.
    }
  }
  return rolledBack;
}

export async function removeProjectFile(rootPath: string, relativePath: string, expectedText: string): Promise<string> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('Native project edits are unavailable on this platform.');
  return DispatchWorkspace.removeWorkspaceFile(rootPath, relativePath, expectedText);
}

export type DesignImageReference = { uri: string; mimeType: string };
export async function pickDesignReferenceImage(): Promise<DesignImageReference | undefined> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('The native image picker is unavailable on this platform.');
  const result = await DispatchWorkspace.pickDesignReferenceImage();
  if (!result) return undefined;
  return JSON.parse(result) as DesignImageReference;
}

export async function readDesignReferenceImage(uri: string): Promise<{ mimeType: string; base64: string }> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('Native image access is unavailable on this platform.');
  return JSON.parse(await DispatchWorkspace.readDesignReferenceImage(uri)) as { mimeType: string; base64: string };
}

export async function saveGeneratedImage(base64Png: string, fileName: string): Promise<string> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error('The native Windows image artifact store is unavailable.');
  return DispatchWorkspace.saveGeneratedImage(base64Png, fileName);
}

export type ProjectEntry = { name: string; relativePath: string; type: 'file' | 'directory'; size: number };
