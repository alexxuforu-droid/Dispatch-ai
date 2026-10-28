// Render the vendored icon set to bitmaps.
//
// React Native has no SVG renderer and React Native Windows does not ship one either, so
// the icons are rasterised here from their SVG source with the same rasteriser the brand
// mark already uses.
//
// One mask per icon, not one bitmap per tone. React Native Windows tints an Image at
// runtime: the Fabric image view composites a flood of the tint colour over the bitmap
// with D2D1_COMPOSITE_MODE_SOURCE_IN, which keeps the bitmap's alpha and replaces its
// colour. So the file only has to carry the shape, and the colour comes from the theme
// when the icon is drawn. Tabler's sources stroke with `currentColor`, which the
// rasteriser resolves to black, so the colour is substituted before rendering.
//
//   node scripts/build-icons.mjs

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const svgDir = path.join(here, '..', 'assets', 'icons', 'svg');
const pngDir = path.join(here, '..', 'assets', 'icons', 'png');

// The mask is white: the tint replaces the colour, so the only thing the file has to hold
// is the alpha of the shape. White also keeps the icon readable if the tint ever fails.
const maskColour = '#FFFFFF';

// 96px for a 24px icon: the app draws icons at 13 to 24, and Windows scales the display
// by up to 200 percent, so the bitmap has to hold the largest size it is asked for.
const raster = 96;

await mkdir(pngDir, { recursive: true });
const sources = (await readdir(svgDir)).filter(name => name.endsWith('.svg'));
for (const name of sources) {
  const raw = await readFile(path.join(svgDir, name), 'utf8');
  const svg = raw.replace(/currentColor/g, maskColour);
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: raster } }).render().asPng();
  await writeFile(path.join(pngDir, `mask-${name.replace(/\.svg$/, '')}.png`), png);
}

// The two-tone set is gone. Leaving the old files behind would keep shipping bitmaps the
// runtime never draws.
for (const file of await readdir(pngDir)) {
  if (/^(light|dark)-.*\.png$/.test(file)) await rm(path.join(pngDir, file));
}

console.log(`Rendered ${sources.length} icon masks at ${raster}px.`);
