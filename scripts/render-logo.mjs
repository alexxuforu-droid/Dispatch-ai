// assets:build — render the brand mark into the native app icons.
//
// The canonical mark is the "drift" orbit mark defined in tools/genicon.mjs —
// the same zero-dep renderer that produces ui/public/favicon.svg/ico + sigil.png
// and src-tauri/icons/icon.ico. This script imports it (no new dependencies) and
// regenerates from it:
//   - windows/DispatchNative/DispatchNative.ico + small.ico (exe icons; DispatchNative.rc embeds small.ico)
//   - windows/DispatchNative.Package/Images/*.png (package logos referenced by Package.appxmanifest)
//   - ios/DispatchNative/Images.xcassets/AppIcon.appiconset/*.png + Contents.json
//     (flattened onto the app tile colour — iOS rejects transparent app icons)
// It also keeps rendering assets/dispatch-mark.png (the in-app icon) from
// assets/dispatch-mark.svg via resvg.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { render, downscale, encodePNG, encodeICO, S } from '../../tools/genicon.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const native = path.join(here, '..');

// --- in-app mark (unchanged): assets/dispatch-mark.png from assets/dispatch-mark.svg ---
const source = await readFile(path.join(native, 'assets', 'dispatch-mark.svg'), 'utf8');
const mark768 = new Resvg(source, {
  fitTo: { mode: 'width', value: 768 },
  background: '#0A0B0C',
}).render().asPng();
await writeFile(path.join(native, 'assets', 'dispatch-mark.png'), mark768);
console.log('Rendered the supplied Dispatch mark at 768px.');

// --- shell icons from the canonical drift mark (genicon renderer) ---
const big = downscale(render(S * 4), S * 4, S); // 4x supersampled 256px RGBA mark

// Box-average `big` into a w x h canvas, mark centered and scaled to `fill` of min(w,h).
function canvas(w, h, fill = 1) {
  const out = Buffer.alloc(w * h * 4);
  const scale = (Math.min(w, h) * fill) / S;
  const ox = (w - S * scale) / 2;
  const oy = (h - S * scale) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fx = (x - ox) / scale;
      const fy = (y - oy) / scale;
      if (fx < 0 || fy < 0 || fx >= S || fy >= S) continue;
      const x0 = Math.max(0, Math.floor(fx - 0.5 / scale));
      const x1 = Math.min(S - 1, Math.ceil(fx + 0.5 / scale));
      const y0 = Math.max(0, Math.floor(fy - 0.5 / scale));
      const y1 = Math.min(S - 1, Math.ceil(fy + 0.5 / scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy <= y1; sy++) {
        for (let sx = x0; sx <= x1; sx++) {
          const o = (sy * S + sx) * 4;
          r += big[o]; g += big[o + 1]; b += big[o + 2]; a += big[o + 3]; n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = Math.round(r / n); out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n); out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

// iOS app icons must be opaque: composite the transparent mark over the tile colour.
const TILE = [10, 11, 12]; // #0A0B0C, same background as the in-app mark render
function flatten(rgba, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = rgba[i * 4 + 3] / 255;
    out[i * 4] = Math.round(rgba[i * 4] * a + TILE[0] * (1 - a));
    out[i * 4 + 1] = Math.round(rgba[i * 4 + 1] * a + TILE[1] * (1 - a));
    out[i * 4 + 2] = Math.round(rgba[i * 4 + 2] * a + TILE[2] * (1 - a));
    out[i * 4 + 3] = 255;
  }
  return out;
}

// --- Windows exe icons (DispatchNative.rc embeds small.ico as IDI_ICON1) ---
const winApp = path.join(native, 'windows', 'DispatchNative');
const exeSizes = [256, 48, 32, 16];
const exePngs = exeSizes.map((s) => ({ size: s, png: encodePNG(s, s, canvas(s, s)) }));
await writeFile(path.join(winApp, 'DispatchNative.ico'), encodeICO(exePngs));
await writeFile(path.join(winApp, 'small.ico'), encodeICO(exePngs.filter((p) => p.size <= 48)));
console.log('Wrote windows/DispatchNative/DispatchNative.ico + small.ico from the drift mark.');

// --- Windows package logos (names referenced by Package.appxmanifest) ---
const imgDir = path.join(native, 'windows', 'DispatchNative.Package', 'Images');
await mkdir(imgDir, { recursive: true });
const pkg = [
  ['StoreLogo.png', 50, 50, 1],
  ['Square44x44Logo.targetsize-24_altform-unplated.png', 24, 24, 1],
  ['Square44x44Logo.scale-200.png', 88, 88, 1],
  ['Square150x150Logo.scale-200.png', 300, 300, 1],
  ['Wide310x150Logo.scale-200.png', 620, 300, 0.62],
  ['SplashScreen.scale-200.png', 1240, 600, 0.55],
  ['LockScreenLogo.scale-200.png', 48, 48, 1],
];
for (const [name, w, h, fill] of pkg) {
  await writeFile(path.join(imgDir, name), encodePNG(w, h, canvas(w, h, fill)));
}
console.log(`Wrote ${pkg.length} package images to windows/DispatchNative.Package/Images/.`);

// --- iOS app icon set (Contents.json entries get their filenames back) ---
const setDir = path.join(native, 'ios', 'DispatchNative', 'Images.xcassets', 'AppIcon.appiconset');
await mkdir(setDir, { recursive: true });
const ios = [
  ['20x20', '2x', 'AppIcon-20x20@2x.png', 40],
  ['20x20', '3x', 'AppIcon-20x20@3x.png', 60],
  ['29x29', '2x', 'AppIcon-29x29@2x.png', 58],
  ['29x29', '3x', 'AppIcon-29x29@3x.png', 87],
  ['40x40', '2x', 'AppIcon-40x40@2x.png', 80],
  ['40x40', '3x', 'AppIcon-40x40@3x.png', 120],
  ['60x60', '2x', 'AppIcon-60x60@2x.png', 120],
  ['60x60', '3x', 'AppIcon-60x60@3x.png', 180],
  ['1024x1024', '1x', 'AppIcon-1024.png', 1024],
];
const images = [];
for (const [size, scale, filename, px] of ios) {
  await writeFile(path.join(setDir, filename), encodePNG(px, px, flatten(canvas(px, px), px, px)));
  images.push({
    idiom: size === '1024x1024' ? 'ios-marketing' : 'iphone',
    scale,
    size,
    filename,
  });
}
await writeFile(path.join(setDir, 'Contents.json'), JSON.stringify({ images, info: { author: 'xcode', version: 1 } }, null, 2) + '\n');
console.log(`Wrote ${ios.length} iOS app icons + Contents.json to AppIcon.appiconset/.`);
