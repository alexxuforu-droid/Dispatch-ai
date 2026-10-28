// Bounded cache: a run can produce several images at once and the raw base64 is kept in
// memory, so the cache is capped in entries and in bytes and evicts the oldest first.
export const MAX_CACHED_IMAGES = 16;
export const MAX_CACHED_IMAGE_BYTES = 32 * 1024 * 1024;

const generatedImages = new Map<string, string>();
const imageSizes = new Map<string, number>();
let cachedBytes = 0;

export function rememberGeneratedImage(uri: string, base64: string): void {
  const previous = imageSizes.get(uri);
  if (previous !== undefined) {
    cachedBytes -= previous;
    generatedImages.delete(uri);
    imageSizes.delete(uri);
  }
  // An image larger than the whole budget is not cached at all; the caller rehydrates it
  // from the stored artifact file instead of holding it in the heap.
  if (base64.length > MAX_CACHED_IMAGE_BYTES) return;
  generatedImages.set(uri, base64);
  imageSizes.set(uri, base64.length);
  cachedBytes += base64.length;
  while (generatedImages.size > MAX_CACHED_IMAGES || (cachedBytes > MAX_CACHED_IMAGE_BYTES && generatedImages.size > 1)) {
    const oldest = generatedImages.keys().next().value;
    if (oldest === undefined) break;
    const size = imageSizes.get(oldest) ?? 0;
    generatedImages.delete(oldest);
    imageSizes.delete(oldest);
    cachedBytes -= size;
  }
}

export function readGeneratedImage(uri: string): string | undefined {
  return generatedImages.get(uri);
}

/** Cache hit wins; otherwise the caller rehydrates pixels from the stored artifact file. Undefined keeps the caller fail-closed. */
export async function readCachedOrStoredImage(uri: string, readStored: (uri: string) => Promise<string | undefined> | string | undefined): Promise<string | undefined> {
  return readGeneratedImage(uri) ?? await readStored(uri);
}

export function forgetGeneratedImage(uri: string): void {
  const size = imageSizes.get(uri);
  if (size !== undefined) cachedBytes -= size;
  imageSizes.delete(uri);
  generatedImages.delete(uri);
}

export function clearGeneratedImages(): void {
  generatedImages.clear();
  imageSizes.clear();
  cachedBytes = 0;
}
