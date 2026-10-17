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
