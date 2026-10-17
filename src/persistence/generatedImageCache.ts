const generatedImages = new Map<string, string>();

export function rememberGeneratedImage(uri: string, base64: string): void {
  generatedImages.set(uri, base64);
}

export function readGeneratedImage(uri: string): string | undefined {
  return generatedImages.get(uri);
}

/** Cache hit wins; otherwise the caller rehydrates pixels from the stored artifact file. Undefined keeps the caller fail-closed. */
export async function readCachedOrStoredImage(uri: string, readStored: (uri: string) => Promise<string | undefined> | string | undefined): Promise<string | undefined> {
  return readGeneratedImage(uri) ?? await readStored(uri);
}

export function forgetGeneratedImage(uri: string): void {
  generatedImages.delete(uri);
}

export function clearGeneratedImages(): void {
  generatedImages.clear();
}

