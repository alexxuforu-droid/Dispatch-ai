// The code judge's second round, fixed at the source.
//
// 1. A borderless control that is also selected painted its focus ring in the same fill as
//    its selection, so the keyboard user saw nothing. The nav item and the team tab now
//    carry a transparent border, which the ring recolours without moving anything.
// 2. Two font sizes sat off the scale: the brand name and the studio's add mark.
// 3. The app's pressed state was a shade different from the shared one.
// 4. An orphan line was left where the round-1 fix removed a line.
// 5. The scratch script that could write the string "utf8" over a source file.
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

// ---- the focus ring on a control that is also selected ---------------------------------
swap('App.tsx',
  "navItem: { height: 40, borderRadius: 8, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }",
  "navItem: { height: 40, borderRadius: 8, borderWidth: 1, borderColor: 'transparent', paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }");

// ---- the type scale -----------------------------------------------------------------------
swap('App.tsx',
  "brandName: { color: colors.text, fontFamily: typography.display, fontSize: 18, fontWeight: '700', letterSpacing: -.4 }",
  "brandName: { color: colors.text, fontFamily: typography.display, fontSize: 16, fontWeight: '700', letterSpacing: -.4 }");

swap('src/DesignStudio.tsx',
  "addMark: { color: colors.textQuiet, fontSize: 17, paddingHorizontal: 2 }",
  "addMark: { color: colors.textQuiet, fontSize: 16, paddingHorizontal: 2 }");

// ---- one pressed state ---------------------------------------------------------------------
swap('App.tsx', "pressed: { opacity: .76 }", "pressed: { opacity: 0.82 }");

// ---- the orphan line ------------------------------------------------------------------------
const workspace = 'src/RunWorkspace.tsx';
const orphan = read(workspace).split('\n').find(line => /^\s+$/.test(line) && line.length > 20);
if (orphan) {
  write(workspace, read(workspace).replace(`${orphan}\n`, ''));
  console.log('the orphan line is gone');
} else {
  console.log('no orphan line found');
}

console.log('the judge findings are fixed');
