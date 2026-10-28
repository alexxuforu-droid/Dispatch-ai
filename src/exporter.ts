/**
 * The way out of the app.
 *
 * The app can write into its own folders, but the person using it cannot get a file out of
 * it: a generated image sits in the artifact folder and a proposed change sits in a run
 * snapshot, and neither can be reached from a file manager. This module is the bridge for
 * that. It asks the native module to show the real Windows Save dialog, writes the file
 * to the place the person picked, and hands the chosen path back.
 *
 * The security half of the contract lives in the native half, because only it knows the
 * artifact folder and the selected project:
 *   - the source of a copied file must be inside the app's artifact folder or inside the
 *     selected project, so this layer cannot name an arbitrary file on disk and have it
 *     copied out;
 *   - the destination may not be reached through a symbolic link;
 *   - text must be valid UTF-8 and within the writer's 1 MB limit;
 *   - every write goes through a unique temporary file and a write-through rename, so a
 *     failed export never leaves a truncated file under the final name.
 *
 * The rules that can be checked here are checked here too, so a malformed path is refused
 * before the native module is reached.
 */
import { Platform } from 'react-native';
import DispatchWorkspace from './NativeWorkspace';

const MAX_EXPORT_TEXT_BYTES = 1024 * 1024;
const FILE_URI_PREFIX = 'file:///';
const UNAVAILABLE = 'The native Windows export is unavailable on this platform.';

/** How many bytes the text takes once it is written as UTF-8. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const code = character.codePointAt(0) ?? 0;
    bytes += code <= 0x7f ? 1 : code <= 0x7ff ? 2 : code <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/**
 * Turns the artifact URI the app stores into the local path the native module reads. A
 * plain path is accepted as it is.
 */
export function toLocalPath(sourcePath: string): string {
  if (typeof sourcePath !== 'string' || !sourcePath.trim()) throw new Error('There is no file to export.');
  let path = sourcePath.trim();
  if (path.toLowerCase().startsWith(FILE_URI_PREFIX)) {
    try { path = decodeURIComponent(path.slice(FILE_URI_PREFIX.length)); }
    catch { throw new Error('The export source path is malformed.'); }
  }
  if (path.startsWith('\\\\') || path.startsWith('//')) throw new Error('The export source must be a plain local file path.');
  if (!/^[A-Za-z]:[\\/]/.test(path)) throw new Error('The export source must be an absolute file path.');
  if (path.slice(2).includes(':')) throw new Error('Alternate data streams cannot be exported.');
  if (path.split(/[\\/]+/).includes('..')) throw new Error('The export source must not contain parent-directory segments.');
  return path;
}

/** The text an export may carry: not empty, encodable as UTF-8, and within the writer's limit. */
export function checkedExportText(text: string): string {
  if (typeof text !== 'string' || text.length === 0) throw new Error('There is nothing to export.');
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = index + 1 < text.length ? text.charCodeAt(index + 1) : 0;
      if (next < 0xdc00 || next > 0xdfff) throw new Error('Only UTF-8 text can be exported.');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new Error('Only UTF-8 text can be exported.');
    }
  }
  if (utf8ByteLength(text) > MAX_EXPORT_TEXT_BYTES) throw new Error('The export is larger than the 1 MB write limit.');
  return text;
}

/** Copies a file the app owns to a place the person picks. Null means the dialog was cancelled. */
export async function saveArtifactAs(sourcePath: string, suggestedName: string): Promise<string | null> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error(UNAVAILABLE);
  return await DispatchWorkspace.saveExistingFileAs(toLocalPath(sourcePath), suggestedName);
}

/** Writes the content of a proposed change to a place the person picks. */
export async function saveChangeAs(content: string, suggestedName: string): Promise<string | null> {
  return await saveTextAs(content, suggestedName);
}

/** Writes a report to a place the person picks. */
export async function saveReportAs(content: string, suggestedName: string): Promise<string | null> {
  return await saveTextAs(content, suggestedName);
}

async function saveTextAs(content: string, suggestedName: string): Promise<string | null> {
  if (Platform.OS !== 'windows' || !DispatchWorkspace) throw new Error(UNAVAILABLE);
  return await DispatchWorkspace.saveTextAs(checkedExportText(content), suggestedName);
}
