// The type floor, the lead colour on chrome, and the mint buttons.
//
// Three mechanical passes over the stylesheets:
//   1. every 10px size becomes 11px, and its line height grows to match,
//   2. the lead colour stops being body text (it is a fill or a large figure),
//   3. the lead colour stops filling controls (chrome is neutral, so a primary button is
//      white with near-black text).
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [...walk('src'), 'App.tsx'];
const counts = { sizes: 0, leadText: 0, leadFill: 0, lineHeights: 0 };
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before.replace(/fontSize:\s*10(?![.\d])/g, () => { counts.sizes += 1; return 'fontSize: 11'; });
  // A line height has to clear 1.3 times its size, so 11px text needs 15.
  after = after.replace(/fontSize:\s*11,\s*lineHeight:\s*(1[0-4])(?![.\d])/g, (match, height) => {
    counts.lineHeights += 1;
    return `fontSize: 11, lineHeight: 15`;
  });
  after = after.replace(/color:\s*colors\.lead\b/g, () => { counts.leadText += 1; return 'color: colors.textQuiet'; });
  after = after.replace(/backgroundColor:\s*colors\.lead\b/g, () => { counts.leadFill += 1; return 'backgroundColor: colors.text'; });
  after = after.replace(/color:\s*colors\.leadInk\b/g, 'color: colors.page');
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
}
console.log(JSON.stringify(counts));
