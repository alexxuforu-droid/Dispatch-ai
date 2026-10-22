// The accent is on the controls the owner asked for it on, and the checker says which.
//
// The rule now names the style it found, so one control can be accepted on its own with a
// reason, instead of the whole file being waved through. The three marks that are not
// actions go quiet: the markdown bullet, the live activity dot (which takes the pop colour,
// the small bright mark's job) and the switch's track.
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
// Replace the lead fill of one style, whatever else that style carries.
const quiet = (file, style, replacement) => {
  const text = read(file);
  const re = new RegExp(`(\\b${style}: \\{[^}]*?)backgroundColor: colors\\.lead`);
  if (!re.test(text)) { console.log('MISS quiet', file, style); return; }
  write(file, text.replace(re, `$1${replacement}`));
};

// ---- the marks that are not actions go quiet ------------------------------------------------
quiet('App.tsx', 'markdownBullet', 'backgroundColor: colors.textMuted');
quiet('App.tsx', 'planningDot', 'backgroundColor: colors.pop');
quiet('src/ui.tsx', 'toggleTrackOn', 'backgroundColor: colors.lineStrong');

// ---- the rule names the style it found --------------------------------------------------------
swap('scripts/check-rn.mjs',
  "  for (const match of text.matchAll(/(?:^|[,{])\\s*(\\w+):\\s*\\{[^}]*backgroundColor:\\s*colors\\.(?:accent|lead)\\b[^}]*\\}/g)) {\n    const block = match[0];",
  "  for (const match of text.matchAll(/(?:^|[,{])\\s*(\\w+):\\s*\\{[^}]*backgroundColor:\\s*colors\\.(?:accent|lead)\\b[^}]*\\}/g)) {\n    const block = match[0];\n    const style = match[1];");
swap('scripts/check-rn.mjs',
  "      fail(file, lineOf(text, match.index), 'accent-fill',\n        'lead colour fills a control; chrome and controls stay neutral');",
  "      fail(file, lineOf(text, match.index), 'accent-fill',\n        'lead colour fills a control; chrome and controls stay neutral', style);");
swap('scripts/check-rn.mjs',
  "      warn(file, lineOf(text, match.index), 'lead-block',\n        'lead colour fills a block; one such block per screen, and only on content');",
  "      warn(file, lineOf(text, match.index), 'lead-block',\n        'lead colour fills a block; one such block per screen, and only on content', style);");

// ---- the accepted findings, each with its reason -----------------------------------------------
swap('scripts/check-rn.mjs',
  "  ['lead-text|src\\\\ui.tsx', 'the inverse button label on the lead block, which is the pairing that stays legible'],\n]);",
  `  ['lead-text|src\\\\ui.tsx', 'the inverse button label on the lead block, which is the pairing that stays legible'],
  ['accent-fill|primary', 'the owner asked for the accent on the primary action, and it is the only one on the screen'],
  ['accent-fill|primaryAction', 'the create button is the one action on the collection screen'],
  ['accent-fill|providerConnect', 'saving and testing the provider is the one action on the settings screen'],
  ['accent-fill|planApproveButton', 'approving the plan is the one action on the thread, and the results screen carries the decision instead'],
  ['accent-fill|checkboxSelected', 'the tick that says a skill is on'],
  ['accent-fill|checkMarkActive', 'the tick that says a skill is on'],
  ['lead-block|sendButton', 'sending the brief is the one action on the design studio'],
  ['lead-block|primaryAction', 'the create button is the one block of colour on the collection screen'],
]);`);

console.log('the accent is on the actions, and the checker says which');
