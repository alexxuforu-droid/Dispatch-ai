// The judge proved the guardrails could be walked around, so they are widened and the pairs
// the interface actually uses are held by a test:
//
// - A 6 digit hex regex misses "#0009", so both the checker and the test now catch 3, 4, 6
//   and 8 digit values.
// - Nothing caught a colour written as a string ("colors.support"), which renders as no fill
//   at all.
// - The contrast test never covered lead on white, the toast title, or the focus ring on a
//   light fill, which is how an invisible toast and an invisible focus ring shipped.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => fs.writeFileSync(file, text, 'utf8');

// ---- the slop checker -----------------------------------------------------------------
const checker = 'scripts/check-rn.mjs';
let check = read(checker);

const HEX_OLD = "text.matchAll(/#[0-9A-Fa-f]{6}\\b/g)";
const HEX_NEW = "text.matchAll(/#[0-9A-Fa-f]{3}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{4}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{8}(?![0-9A-Fa-f])/g)";
if (!check.includes(HEX_OLD)) { console.log('MISS checker hex regex'); }
else check = check.replace(HEX_OLD, HEX_NEW);

const QUOTED_OLD = `  // Slop floor: nothing under 11px.`;
const QUOTED_NEW = `  // Slop floor: a colour written as a string. "colors.support" is a string, so the
  // fill silently disappears and the state looks unselected.
  if (!isTokenFile) {
    for (const match of text.matchAll(/['"]colors\\.[A-Za-z]+['"]/g)) {
      fail(file, lineOf(text, match.index), 'quoted-colour',
        'a colour token name in quotes is a string, not a colour');
    }
  }

  // Slop floor: nothing under 11px.`;
if (!check.includes(QUOTED_OLD)) { console.log('MISS checker insertion point'); }
else check = check.replace(QUOTED_OLD, QUOTED_NEW);

write(checker, check);

// ---- the contract tests ----------------------------------------------------------------
const test = '__tests__/theme.test.ts';
let suite = read(test);

const TEST_HEX_OLD = 'for (const match of text.matchAll(/#[0-9A-Fa-f]{6}\\b/g)) {';
const TEST_HEX_NEW = 'for (const match of text.matchAll(/#[0-9A-Fa-f]{3}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{4}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])|#[0-9A-Fa-f]{8}(?![0-9A-Fa-f])/g)) {';
if (!suite.includes(TEST_HEX_OLD)) { console.log('MISS test hex regex'); }
else suite = suite.replace(TEST_HEX_OLD, TEST_HEX_NEW);

const QUOTED_TEST_OLD = `    expect(offenders).toEqual([]);
  });
});`;
const QUOTED_TEST_NEW = `    expect(offenders).toEqual([]);
  });

  test('no source file writes a colour as a string', () => {
    // "colors.support" is a string, so the fill disappears and the state looks unselected.
    const offenders: string[] = [];
    const files = [...sourceFiles(path.join(repoRoot, 'src')), path.join(repoRoot, 'App.tsx')];
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const match of text.matchAll(/['"]colors\\.[A-Za-z]+['"]/g)) {
        offenders.push(\`\${path.relative(repoRoot, file)}: \${match[0]}\`);
      }
    }
    expect(offenders).toEqual([]);
  });
});`;
if (!suite.includes(QUOTED_TEST_OLD)) { console.log('MISS test insertion point'); }
else suite = suite.replace(QUOTED_TEST_OLD, QUOTED_TEST_NEW);

const PAIRS_OLD = `  test('surfaces get lighter as they rise, with no shadows to do the work', () => {`;
const PAIRS_NEW = `  test('the pairs the interface actually uses clear their floors', () => {
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

  test('surfaces get lighter as they rise, with no shadows to do the work', () => {`;
if (!suite.includes(PAIRS_OLD)) { console.log('MISS test pairs insertion point'); }
else suite = suite.replace(PAIRS_OLD, PAIRS_NEW);

write(test, suite);

// ---- the focus ring ---------------------------------------------------------------------
// The ring was the lead colour on every surface, which vanishes on a white button and on the
// lead block itself. It now follows the fill it sits on.
const reveal = 'src/Reveal.tsx';
let ring = read(reveal);

const RING_OLD = `      const onAccent = background?.toLowerCase() === colors.lead.toLowerCase();
      const hasBorder = entries.some(entry => typeof entry.borderWidth === 'number' && entry.borderWidth > 0);
      if (hasBorder) return [resolved, { borderColor: onAccent ? colors.leadInk : colors.lead }];`;
const RING_NEW = `      const onAccent = background?.toLowerCase() === colors.lead.toLowerCase();
      const onLight = background ? LIGHT_FILLS.includes(background.toLowerCase()) : false;
      const hasBorder = entries.some(entry => typeof entry.borderWidth === 'number' && entry.borderWidth > 0);
      // The ring follows the fill it sits on: the lead colour on a dark surface, the page
      // colour on a light one, and the ink on the lead block.
      const ring = onAccent ? colors.leadInk : onLight ? colors.page : colors.lead;
      if (hasBorder) return [resolved, { borderColor: ring }];`;
if (!ring.includes(RING_OLD)) { console.log('MISS ring'); }
else ring = ring.replace(RING_OLD, RING_NEW);

const LIGHT_OLD = `export function FocusPressable({`;
const LIGHT_NEW = `/** The light fills in the app. A focus ring has to be dark on these. */
const LIGHT_FILLS = [colors.text, colors.textDim, colors.pop].map(value => value.toLowerCase());

export function FocusPressable({`;
if (!ring.includes(LIGHT_OLD)) { console.log('MISS light fills'); }
else ring = ring.replace(LIGHT_OLD, LIGHT_NEW);

write(reveal, ring);

console.log('guardrails widened and the focus ring made surface aware');
