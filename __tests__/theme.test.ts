/**
 * The design tokens are a contract, not a suggestion.
 *
 * These tests hold the parts a reviewer cannot check by eye: that the palette is legible,
 * that the type scale is the only scale, that the radius scale is the only scale, and that
 * nobody has written a colour outside the token file.
 *
 * The file is read with the node runtime rather than imported, because the repo has no
 * @types/node: a type-only import would break the type check for the whole project.
 */
declare const __dirname: string;
const fs = require('fs');
const path = require('path');

export {};
import { colors, radius, space, type } from '../src/theme';

const repoRoot = path.join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  const stat = fs.statSync(dir);
  if (stat.isFile()) return dir.endsWith('.tsx') || dir.endsWith('.ts') ? [dir] : [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .flatMap((entry: { isFile(): boolean; isDirectory(): boolean; name: string }) => {
      if (!entry.isFile() && !entry.isDirectory()) return [];
      if (entry.isDirectory()) return sourceFiles(path.join(dir, entry.name));
      return entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') ? [path.join(dir, entry.name)] : [];
    });
}

const luminance = (hex: string): number => {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map(offset => parseInt(value.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map(channel => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};

const contrast = (first: string, second: string): number => {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
};

describe('the palette', () => {
  test('body text clears 4.5:1 on every surface it can sit on', () => {
    const surfaces = [colors.page, colors.surface, colors.surfaceRaised, colors.surfaceActive];
    for (const text of [colors.text, colors.textQuiet, colors.textMuted]) {
      for (const surface of surfaces) {
        expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  test('a control boundary is visible against its own fill', () => {
    expect(contrast(colors.lineStrong, colors.surfaceRaised)).toBeGreaterThanOrEqual(3);
  });

  test('text on the lead fill is legible', () => {
    expect(contrast(colors.leadInk, colors.lead)).toBeGreaterThanOrEqual(4.5);
  });

  test('the lead colour is legible as a large figure', () => {
    expect(contrast(colors.lead, colors.surface)).toBeGreaterThanOrEqual(3);
  });

  test('state colours are legible on their own surfaces', () => {
    expect(contrast(colors.attention, colors.attentionSurface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.critical, colors.criticalSurface)).toBeGreaterThanOrEqual(4.5);
  });

  test('the pairs the interface actually uses clear their floors', () => {
    // The white button and its label, the hover fill under that label, the toast title on
    // the raised surface, the inverse button on the lead block, and the focus ring on a
    // light fill and on the lead block. Each of these shipped once without a test.
    expect(contrast(colors.page, colors.text)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.page, colors.textDim)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.text, colors.surfaceRaised)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.leadInk, colors.lead)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.page, colors.pop)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.lead, colors.page)).toBeGreaterThanOrEqual(4.5);
  });

  test('surfaces get lighter as they rise, with no shadows to do the work', () => {
    expect(luminance(colors.page)).toBeLessThan(luminance(colors.surface));
    expect(luminance(colors.surface)).toBeLessThan(luminance(colors.surfaceRaised));
    expect(luminance(colors.surfaceRaised)).toBeLessThan(luminance(colors.surfaceActive));
    const source = fs.readFileSync(path.join(repoRoot, 'src/theme.ts'), 'utf8');
    expect(source).not.toMatch(/shadowColor|boxShadow|elevation/);
  });
});

describe('the type scale', () => {
  test('nothing is set below 11px', () => {
    for (const [name, style] of Object.entries(type)) {
      expect({ name, size: style.fontSize }).toMatchObject({ size: expect.any(Number) });
      expect(style.fontSize).toBeGreaterThanOrEqual(11);
    }
  });

  test('every step has room for its own lines', () => {
    for (const [name, style] of Object.entries(type)) {
      // Display type is set tighter on purpose; body and label copy needs more air.
      const minimum = name === 'hero' || name === 'title' ? 1.15 : 1.3;
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize * minimum);
    }
  });

  test('one family for the interface and one for code', () => {
    // Segoe UI Variable Display and Segoe UI Variable Text are optical sizes of one family.
    const families = new Set(Object.values(type).map(style => style.fontFamily.replace(/ (Display|Text)$/, '')));
    expect(families.size).toBe(2);
  });

  test('the scale is a fixed set of sizes', () => {
    const sizes = new Set(Object.values(type).map(style => style.fontSize));
    expect([...sizes].sort((a, b) => a - b)).toEqual([11, 12, 13, 14, 16, 20, 28]);
  });
});

describe('the geometry scales', () => {
  test('one radius per tier', () => {
    expect(Object.values(radius).sort((a, b) => a - b)).toEqual([4, 6, 8, 12, 999]);
  });

  test('spacing is multiples of four', () => {
    for (const value of Object.values(space)) {
      expect(value % 4).toBe(0);
    }
  });

  test('a group gap is at least twice the gap inside it', () => {
    expect(space.xxl).toBeGreaterThanOrEqual(space.md * 2);
    expect(space.section).toBeGreaterThanOrEqual(space.xxl + 8);
  });
});

describe('the token file is the only place a colour is written', () => {
  test('no source file outside src/theme.ts contains a hex colour', () => {
    const offenders: string[] = [];
    const files = [...sourceFiles(path.join(repoRoot, 'src')), path.join(repoRoot, 'App.tsx')];
    for (const file of files) {
      if (path.resolve(file) === path.join(repoRoot, 'src', 'theme.ts')) continue;
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/#[0-9A-Fa-f]{3}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{4}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{8}(?![0-9A-Fa-f])/g)) {
        offenders.push(`${path.relative(repoRoot, file)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('no source file writes a colour as a string', () => {
    // "colors.support" is a string, so the fill disappears and the state looks unselected.
    const offenders: string[] = [];
    const files = [...sourceFiles(path.join(repoRoot, 'src')), path.join(repoRoot, 'App.tsx')];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/['"]colors\.[A-Za-z]+['"]/g)) {
        offenders.push(`${path.relative(repoRoot, file)}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
