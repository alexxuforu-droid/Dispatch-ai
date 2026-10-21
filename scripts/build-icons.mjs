// Render the vendored icon set to bitmaps.
//
// React Native has no SVG renderer and React Native Windows does not ship one either, so
// the icons are rasterised here from their SVG source with the same rasteriser the brand
// mark already uses.
//
// Two tones are rendered, because the app draws icons on a dark surface and on the white
// primary button, and the runtime cannot recolour a bitmap. Tabler's sources stroke with
// `currentColor`, which the rasteriser resolves to black, so the colour is substituted
// before rendering.
//
//   node scripts/build-icons.mjs

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const svgDir = path.join(here, '..', 'assets', 'icons', 'svg');
const pngDir = path.join(here, '..', 'assets', 'icons', 'png');

const tones = { light: '#F5F5F5', dark: '#0A0B0C' };

await mkdir(pngDir, { recursive: true });
const sources = (await readdir(svgDir)).filter(name => name.endsWith('.svg'));
for (const name of sources) {
  const raw = await readFile(path.join(svgDir, name), 'utf8');
  for (const [tone, colour] of Object.entries(tones)) {
    const svg = raw.replace(/currentColor/g, colour);
    // 48px for a 24px icon: the app draws icons at 16 to 24, and Windows scales the display
    // by up to 200 percent, so the bitmap has to hold the largest size it is asked for.
    const png = new Resvg(svg, { fitTo: { mode: 'width', value: 48 } }).render().asPng();
    await writeFile(path.join(pngDir, `${tone}-${name.replace(/\.svg$/, '')}.png`), png);
  }
}
console.log(`Rendered ${sources.length} icons in ${Object.keys(tones).length} tones at 48px.`);
