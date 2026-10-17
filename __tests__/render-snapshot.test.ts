/**
 * Smoke coverage for the headless rasterizer.
 *
 * scripts/render-snapshot.mjs is not imported by src/, so the jest preset never touched it
 * and its flex/percentage/asset logic was guarded only by one-shot manual runs. This drives
 * the real CLI as a subprocess against fixture trees in a temp directory, so a refactor
 * that breaks percentage resolution, flexBasis arithmetic, or the asset fallback fails here.
 */

// The repo has no @types/node, so process/__dirname are undeclared to the compiler even
// though they exist at runtime. Declare only the missing ones; require is already declared
// globally by the existing types.
declare const process: { execPath: string; env: Record<string, string | undefined> };
declare const __dirname: string;
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'render-snapshot.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'render-snap-test-'));

function runScript(tree: unknown, name: string, env: Record<string, string> = {}): { status: number; png: string } {
  const treePath = path.join(TMP, `${name}.json`);
  const pngPath = path.join(TMP, `${name}.png`);
  fs.writeFileSync(treePath, JSON.stringify(tree), 'utf8');
  let status = 0;
  try {
    execFileSync(process.execPath, [SCRIPT, treePath, pngPath, '400', '300'], {
      env: { ...process.env, ...env },
      stdio: 'pipe',
    });
  } catch (error) {
    const code = (error as { status?: number })?.status;
    status = typeof code === 'number' ? code : 1;
  }
  return { status, png: pngPath };
}

const text = (value: string, extra: Record<string, unknown> = {}) => ({
  type: 'Text',
  props: { style: { color: '#F1F1F2', fontSize: 12, ...extra } },
  children: [value],
});

const view = (style: Record<string, unknown>, children: unknown[]) => ({ type: 'View', props: { style }, children });

afterAll(() => {
  fs.rmSync(TMP, { recursive: true, force: true });
});

describe('render-snapshot CLI', () => {
  test('renders a plain tree and exits cleanly', () => {
    const tree = view({ flex: 1, backgroundColor: '#14161B' }, [text('hello')]);
    const { status, png } = runScript(tree, 'plain');
    expect(status).toBe(0);
    expect(fs.existsSync(png)).toBe(true);
    expect(fs.statSync(png).size).toBeGreaterThan(0);
  });

  test('a malformed percentage width does not throw and is ignored', () => {
    const tree = view({ flex: 1, flexDirection: 'row' }, [
      view({ width: 'abc%', height: 20, backgroundColor: '#2C313A' }, [text('a')]),
      view({ width: '%', height: 20, backgroundColor: '#2C313A' }, [text('b')]),
      view({ width: '50%', height: 20, backgroundColor: '#9AE2D2' }, [text('c')]),
    ]);
    const { status, png } = runScript(tree, 'percent');
    expect(status).toBe(0);
    expect(fs.statSync(png).size).toBeGreaterThan(0);
  });

  test('flexBasis with flexGrow lays out without collapsing or throwing', () => {
    const tree = view({ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, [
      view({ flexGrow: 1, flexBasis: 150, height: 40, backgroundColor: '#1D2128' }, [text('one')]),
      view({ flexGrow: 1, flexBasis: 150, height: 40, backgroundColor: '#1D2128' }, [text('two')]),
      view({ flexGrow: 1, flexBasis: 150, height: 40, backgroundColor: '#1D2128' }, [text('three')]),
    ]);
    const { status, png } = runScript(tree, 'flexbasis');
    expect(status).toBe(0);
    expect(fs.statSync(png).size).toBeGreaterThan(0);
  });

  test('an image with no resolvable asset falls back to a placeholder instead of crashing', () => {
    const tree = view({ flex: 1 }, [
      { type: 'Image', props: { source: { testUri: '../../../assets/nope-does-not-exist.png' }, style: { width: 40, height: 40 } }, children: null },
    ]);
    const unset = runScript(tree, 'asset-unset');
    expect(unset.status).toBe(0);
    const missingDir = runScript(tree, 'asset-missing-dir', { PROJECT_ASSETS: path.join(TMP, 'no-such-dir') });
    expect(missingDir.status).toBe(0);
    expect(fs.statSync(missingDir.png).size).toBeGreaterThan(0);
  });

  test('a real asset directory resolves and produces a larger image than the placeholder', () => {
    const assets = path.resolve(__dirname, '..', 'assets');
    if (!fs.existsSync(path.join(assets, 'dispatch-mark.png'))) return; // fixture may be absent
    const tree = view({ flex: 1 }, [
      { type: 'Image', props: { source: { testUri: '../../../assets/dispatch-mark.png' }, style: { width: 80, height: 80 } }, children: null },
    ]);
    const placeholder = runScript(tree, 'asset-placeholder');
    const real = runScript(tree, 'asset-real', { PROJECT_ASSETS: assets });
    expect(real.status).toBe(0);
    // Embedded artwork must be materially larger than a flat gray rect.
    expect(fs.statSync(real.png).size).toBeGreaterThan(fs.statSync(placeholder.png).size);
  });
});