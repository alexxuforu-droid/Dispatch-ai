// The owner does not like the green and the white. The colour layer moves to indigo on
// near-black, and the white primary button becomes the lead colour with near-black ink.
//
// - The lead is the one block of content that lands, the focus ring, and the primary
//   action: #8E8FF0, with a deeper shade for its hover.
// - The support is the second block: a deep indigo.
// - The pop is the small bright mark: a pale lilac.
// - The rail's New run stops being a white block and becomes a quiet raised surface, so
//   one accent is on screen at a time.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 90)); return; }
  write(file, text.replace(from, to));
};

// ---- the tokens ----------------------------------------------------------------------------
swap('src/theme.ts',
  `  // One step down from the text colour, for the hover fill of a white button. The label on
  // that button is the page colour, so the fill has to stay light.
  textDim: '#D9DBDD',

  // The palette. The Dispatch mark is mint, so mint is the lead, and the roles below are
  // the ones the oxfords rules give a three colour palette.
  lead: '#9AE2D2',
  leadInk: '#0A0B0C',
  support: '#1F3B35',
  pop: '#E4FBF4',`,
  `  // The palette. One hue, three jobs, the way the oxfords rules give a three colour
  // palette: the lead is the one block of content that lands on a screen, the support is
  // the second block, and the pop is the small mark that needs attention.
  lead: '#8E8FF0',
  // One step deeper, for the hover of a control that is filled with the lead.
  leadHover: '#7B7CD9',
  // The ink that goes on the lead, and the ink of the inverse button that sits on it.
  leadInk: '#0A0B0C',
  support: '#2A2A55',
  pop: '#C9C9FF',`);

// ---- the primary button is the lead, not a white block -------------------------------------
swap('src/ui.tsx',
  "  button_primary: { backgroundColor: colors.text, borderColor: colors.text },",
  "  button_primary: { backgroundColor: colors.lead, borderColor: colors.lead },");
swap('src/ui.tsx',
  "  buttonLabel_primary: { color: colors.page },",
  "  buttonLabel_primary: { color: colors.leadInk },");
swap('src/ui.tsx',
  "  buttonHovered_primary: { backgroundColor: colors.textDim },",
  "  buttonHovered_primary: { backgroundColor: colors.leadHover },");

// ---- the focus ring on a light fill is the page colour, and the lead is light now ------------
swap('src/Reveal.tsx',
  "const LIGHT_FILLS = [colors.text, colors.textDim, colors.pop].map(value => value.toLowerCase());",
  "const LIGHT_FILLS = [colors.text, colors.lead, colors.pop].map(value => value.toLowerCase());");

// ---- the rail's new run is a quiet surface, not a block ---------------------------------------
swap('App.tsx',
  "newRun: { height: 42, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.text, marginBottom: 24, gap: 9 }",
  "newRun: { height: 42, borderRadius: 8, borderWidth: 1, borderColor: colors.line, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', backgroundColor: colors.surfaceRaised, marginBottom: 24, gap: 9 }");
swap('App.tsx',
  "newRunText: { color: colors.page, fontFamily: typography.body, fontSize: 13, fontWeight: '700' }",
  "newRunText: { color: colors.text, fontFamily: typography.body, fontSize: 13, fontWeight: '700' }");
swap('App.tsx',
  '<DispatchIcon name="plus" size={18} color={colors.page} />',
  '<DispatchIcon name="plus" size={18} color={colors.text} />');

// ---- the contract test that holds the pairs the interface actually uses -------------------------
swap('__tests__/theme.test.ts',
  "    expect(contrast(colors.page, colors.textDim)).toBeGreaterThanOrEqual(4.5);",
  "    expect(contrast(colors.leadInk, colors.leadHover)).toBeGreaterThanOrEqual(4.5);");

console.log('the colour layer is indigo on near-black');
