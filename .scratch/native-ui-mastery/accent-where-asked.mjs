// The accent is on the controls the owner asked for it on, and nowhere else.
//
// - The switch that is on goes back to a neutral grey track: a control is chrome, and the
//   knob's position already says which way it is.
// - The plan's approval button in the thread goes quiet: the decision row on Results is
//   the one lead block in the app.
// - The markdown bullet goes quiet, and the live activity dot takes the pop colour, which
//   is the small bright mark's job.
//
// The slop checker now accepts a finding by style, so the accent on the primary action can
// be accepted with a reason that names it, instead of the whole file being waved through.
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

// ---- the switch is neutral again ------------------------------------------------------------
swap('src/ui.tsx',
  "  toggleTrackOn: { backgroundColor: colors.lead },",
  "  toggleTrackOn: { backgroundColor: colors.lineStrong },");

// ---- the thread's approval is quiet --------------------------------------------------------
swap('App.tsx',
  "planApproveButton: { minHeight: 32, paddingHorizontal: 12, borderRadius: 6, backgroundColor: colors.lead }",
  "planApproveButton: { minHeight: 32, paddingHorizontal: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceRaised }");

// ---- a neutral bullet, and a live dot in the pop colour ---------------------------------------
swap('App.tsx',
  "markdownBullet: { color: colors.lead, fontSize: 12, lineHeight: 19, width: 14 }",
  "markdownBullet: { color: colors.textMuted, fontSize: 12, lineHeight: 19, width: 14 }");
swap('App.tsx',
  "planningDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.lead }",
  "planningDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.pop }");

// ---- the checker accepts a finding by style, so one control can be accepted on its own --------
swap('scripts/check-rn.mjs',
  "const warn = (file, line, id, message) => findings.push({ level: 'WARN', file, line, id, message });",
  "const warn = (file, line, id, message, style) => findings.push({ level: 'WARN', file, line, id, message, style });\nconst fail = (file, line, id, message, style) => findings.push({ level: 'FAIL', file, line, id, message, style });");

swap('scripts/check-rn.mjs',
  "  const key = `${finding.level}|${finding.id}|${finding.file}`;",
  "  const key = `${finding.level}|${finding.id}|${finding.file}|${finding.style ?? ''}`;");

swap('scripts/check-rn.mjs',
  "  const reason = ACCEPTED.get(`${entry.id}|${entry.file.replace(/\\//g, '\\\\')}`);",
  "  const reason = ACCEPTED.get(`${entry.id}|${entry.style ?? entry.file.replace(/\\//g, '\\\\')}`) ?? ACCEPTED.get(`${entry.id}|${entry.file.replace(/\\//g, '\\\\')}`);");

console.log('the accent is where the owner asked for it');
