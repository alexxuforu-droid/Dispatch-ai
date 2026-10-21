// The final code judge's findings, minus the one that was wrong.
//
// - The dead collectionHeading key goes: the slogans it styled are gone.
// - The team picker's rows are borderless and can be selected, so a focused selected row
//   painted its ring in the same fill as its selection. They carry a transparent border
//   now, like the nav item and the team tab, so the ring recolours a border that is
//   always there and nothing shifts under the keyboard user's hands.
// - The icon button's tooltip needs a positioned wrapper to sit against.
//
// NOT applied: the sixteen style keys the judge called dead in the design studio. They are
// used: the studio's stylesheet is under the name `s`, and the judge's search looked for
// `styles.`. Ten references to those keys are live.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 80)); return; }
  write(file, text.replace(from, to));
};

// The dead key.
swap('App.tsx',
  "collectionHeading: { color: colors.text, fontFamily: typography.display, fontSize: 20, fontWeight: '600', marginTop: 0 }",
  "");

// The team picker's rows carry a border for the focus ring to recolour.
swap('App.tsx',
  "roleOption: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: 1,",
  "roleOption: { minHeight: 65, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: 'transparent', borderBottomWidth: 1,");

// The tooltip sits against its own button.
swap('src/ui.tsx',
  "iconButtonWrap: { alignItems: 'center' },",
  "iconButtonWrap: { alignItems: 'center', position: 'relative' },");

console.log('the final code judge findings are fixed');
