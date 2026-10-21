// Render the vendored icon set to bitmaps.
//
// React Native has no SVG renderer, and React Native Windows does not ship one either, so
// the icons are rasterised here from their SVG source with the same rasteriser the brand
// mark already uses. The bitmaps are white with an alpha channel, and the app tints them
// at runtime, so one file per icon covers every state.
//
//   node scripts/build-icons.mjs
//
// The SVG sources live in assets/icons/svg and are part of the repository. They come from
// Tabler Icons, which is MIT licensed.

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const svgDir = path.join(here, '..', 'assets', 'icons', 'svg');
const pngDir = path.join(here, '..', 'assets', 'icons', 'png');

await mkdir(pngDir, { recursive: true });
const sources = (await readdir(svgDir)).filter(name => name.endsWith('.svg'));
for (const name of sources) {
  const svg = await readFile(path.join(svgDir, name), 'utf8');
  // 48px for a 24px icon: the app draws icons at 16 to 24, and Windows scales the display
  // by up to 200 percent, so the bitmap has to hold the largest size it is asked for.
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: 48 } }).render().asPng();
  await writeFile(path.join(pngDir, name.replace(/\.svg$/, '.png')), png);
}
console.log(`Rendered ${sources.length} icons at 48px.`);
