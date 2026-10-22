// One accent per screen. Turning every white block into the lead left the design studio
// with three filled indigo buttons and the settings screen with two. The primary of each
// screen keeps the accent; the secondaries go back to a quiet raised surface with a light
// label.
//
// The slop checker's accent rule was looking for the token names an older theme used, so it
// never matched the lead at all. It looks for the lead now, and the switch that is on is
// the one control that carries the accent, with the knob's position saying the same thing.
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

// ---- the settings screen: "Save and test" is the primary, the folder button is quiet ----
swap('App.tsx',
  "workspaceButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 8, backgroundColor: colors.lead }",
  "workspaceButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 13, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceRaised }");
swap('App.tsx',
  "workspaceButtonText: { color: colors.page, fontFamily: typography.body, fontSize: 11, fontWeight: '700' }",
  "workspaceButtonText: { color: colors.text, fontFamily: typography.body, fontSize: 11, fontWeight: '700' }");

// ---- the design studio: sending the brief is the primary, adding a card is quiet ----------
swap('src/DesignStudio.tsx',
  "addCanvasButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 8, backgroundColor: colors.lead }",
  "addCanvasButton: { minHeight: 34, justifyContent: 'center', paddingHorizontal: 9, borderRadius: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceRaised }");
swap('src/DesignStudio.tsx',
  "addCanvasText: { color: colors.page, fontFamily: typography.body, fontSize: 11, fontWeight: '700' }",
  "addCanvasText: { color: colors.text, fontFamily: typography.body, fontSize: 11, fontWeight: '700' }");

// ---- the checker looks for the token the theme actually has ---------------------------------
swap('scripts/check-rn.mjs',
  "/(?:^|[,{])\\s*(\\w+):\\s*\\{[^}]*backgroundColor:\\s*colors\\.(?:accentSubtle|support)\\b[^}]*\\}/g",
  "/(?:^|[,{])\\s*(\\w+):\\s*\\{[^}]*backgroundColor:\\s*colors\\.(?:lead|support)\\b[^}]*\\}/g");

console.log('one accent per screen');
