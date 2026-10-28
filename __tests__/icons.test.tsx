/**
 * The icon set has to be able to change colour.
 *
 * The set used to ship two bitmaps per icon, one light and one dark, and DispatchIcon
 * picked between them with a test for the colour. A selected icon and an inactive one
 * therefore drew the same pixels. The set is now one monochrome alpha mask per icon and
 * the colour comes from the theme, so these tests hold that contract: the colour the
 * caller asks for is the colour that is rendered, and it is the only thing that changes
 * between an active icon and an inactive one.
 */
import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

import { DispatchIcon } from '../src/DispatchIcon';
import type { IconName } from '../src/DispatchIcon';
import { colors } from '../src/theme';

// The repo has no @types/node, so process/__dirname are undeclared to the compiler even
// though they exist at runtime. Declare only the missing ones; require is already declared
// globally by the existing types.
declare const __dirname: string;
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const BufferCtor = require('buffer').Buffer;

const repoRoot = path.join(__dirname, '..');
const pngDir = path.join(repoRoot, 'assets', 'icons', 'png');
const svgDir = path.join(repoRoot, 'assets', 'icons', 'svg');

type ImageNode = { type: string; props: Record<string, unknown> };

async function renderIcon(props: { name: IconName; size?: number; color?: string }): Promise<ImageNode> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(<DispatchIcon {...props} />);
  });
  return tree.toJSON() as ImageNode;
}

describe('the icon renders the colour it is given', () => {
  test('the requested colour reaches the image', async () => {
    const icon = await renderIcon({ name: 'team', size: 19, color: colors.lead });
    expect(icon.type).toBe('Image');
    expect(icon.props.tintColor).toBe(colors.lead);
    expect(icon.props.style).toMatchObject({ width: 19, height: 19 });
  });

  test('two tones are two rendered colours out of one mask', async () => {
    const active = await renderIcon({ name: 'team', color: colors.lead });
    const inactive = await renderIcon({ name: 'team', color: colors.textMuted });
    expect(active.props.tintColor).not.toBe(inactive.props.tintColor);
    // One file, two colours: the difference is the tint, not a second bitmap.
    expect(active.props.source).toEqual(inactive.props.source);
  });

  test('the active team is no longer the inactive team', async () => {
    // The team tabs draw the selected tab in the lead and the rest in the muted text
    // colour, and the saved team card asks for the lead. Both used to land on the same
    // light bitmap.
    const selected = await renderIcon({ name: 'team', color: colors.lead });
    const unselected = await renderIcon({ name: 'team', color: colors.textMuted });
    expect(selected.props.tintColor).toBe(colors.lead);
    expect(unselected.props.tintColor).toBe(colors.textMuted);
    expect(selected.props.tintColor).not.toBe(unselected.props.tintColor);
  });

  test('the ink on a filled button is drawn in that ink', async () => {
    const icon = await renderIcon({ name: 'check', color: colors.leadInk });
    expect(icon.props.tintColor).toBe(colors.leadInk);
  });
});

describe('the shipped set', () => {
  const componentSource = (): string => fs.readFileSync(path.join(repoRoot, 'src', 'DispatchIcon.tsx'), 'utf8');

  test('every icon has its own mask, and the masks are the only bitmaps', () => {
    const masks = [...componentSource().matchAll(/require\('\.\.\/assets\/icons\/png\/([^']+)'\)/g)].map(match => match[1]);
    const sources = fs.readdirSync(svgDir).filter((name: string) => name.endsWith('.svg'));

    expect(masks).toHaveLength(sources.length);
    expect(new Set(masks).size).toBe(masks.length);
    for (const file of masks) {
      expect(fs.existsSync(path.join(pngDir, file))).toBe(true);
    }
    // No bitmap per tone any more, in the component or on disk.
    expect(masks.filter(file => /^(light|dark)-/.test(file))).toEqual([]);
    const shipped = fs.readdirSync(pngDir);
    expect(shipped.filter((file: string) => /^(light|dark)-/.test(file))).toEqual([]);
    expect(shipped.filter((file: string) => file.startsWith('mask-')).sort()).toEqual(
      sources.map((name: string) => `mask-${name.replace(/\.svg$/, '')}.png`).sort(),
    );
  });

  test('the masks are transparent, not opaque squares', () => {
    for (const file of fs.readdirSync(pngDir).filter((name: string) => name.startsWith('mask-'))) {
      const bytes = fs.readFileSync(path.join(pngDir, file));
      // A PNG is a signature, then chunks of length, type, data and crc.
      let offset = 8;
      let width = 0;
      let depth = 0;
      let colourType = 0;
      const idat: unknown[] = [];
      while (offset < bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        if (type === 'IHDR') {
          width = bytes.readUInt32BE(offset + 8);
          depth = bytes[offset + 16];
          colourType = bytes[offset + 17];
        }
        if (type === 'IDAT') idat.push(bytes.subarray(offset + 8, offset + 8 + length));
        offset += 12 + length;
        if (type === 'IEND') break;
      }
      // 8 bit RGBA: the alpha is what the tint multiplies.
      expect({ file, depth, colourType }).toEqual({ file, depth: 8, colourType: 6 });
      expect(width).toBeGreaterThanOrEqual(48);
      // The first pixel of the first row: every filter predictor is zero there, so the
      // inflated bytes are the pixel. The corner of a glyph is empty, so alpha is 0.
      const raw = zlib.inflateSync(BufferCtor.concat(idat));
      expect(raw[4]).toBe(0);
    }
  });
});

describe('the platform this depends on', () => {
  test('the installed runtime tints an image', () => {
    const rnw = path.join(repoRoot, 'node_modules', 'react-native-windows');
    const image = fs.readFileSync(path.join(rnw, 'Libraries', 'Image', 'Image.windows.js'), 'utf8');
    expect(image).toMatch(/const tintColor = props\.tintColor/);
    expect(image).toMatch(/tintColor=\{tintColor\}/);

    // The tint itself is a flood of the colour composited over the bitmap with
    // SOURCE_IN, which keeps the bitmap alpha and replaces its colour.
    const view = fs.readFileSync(path.join(rnw, 'Microsoft.ReactNative', 'Fabric', 'Composition', 'ImageComponentView.cpp'), 'utf8');
    expect(view).toMatch(/isColorMeaningful\(imgProps\.tintColor\)/);
    expect(view).toMatch(/D2D1_COMPOSITE_MODE_SOURCE_IN/);

    // That code is the Fabric image view, so the app has to be on the new architecture.
    const features = fs.readFileSync(path.join(repoRoot, 'windows', 'ExperimentalFeatures.props'), 'utf8');
    expect(features).toMatch(/RnwNewArch>true/);
  });
});
