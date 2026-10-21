// One-shot rename of the old token keys to the new oxfords names, across the app and its
// tests. The values come from the new src/theme.ts, so only the keys move here.
import fs from 'node:fs';
import path from 'node:path';

const colorMap = {
  canvas: 'page',
  sidebar: 'page',
  panel: 'surface',
  raised: 'surfaceRaised',
  raisedHover: 'surfaceActive',
  border: 'line',
  borderStrong: 'lineStrong',
  ink: 'text',
  white: 'text',
  secondary: 'textQuiet',
  muted: 'textMuted',
  accent: 'lead',
  accentInk: 'leadInk',
  accentFocus: 'pop',
  warning: 'attention',
  danger: 'critical',
};

const typeMap = {
  display: 'hero',
  title: 'title',
  heading: 'section',
  body: 'body',
  bodySmall: 'bodySmall',
  label: 'label',
  caption: 'meta',
  code: 'code',
  codeSmall: 'codeSmall',
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = ['App.tsx', ...walk('src'), ...walk('__tests__')];
let changed = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before.replace(/colors\.([A-Za-z]+)/g, (match, key) =>
    colorMap[key] ? `colors.${colorMap[key]}` : match);
  after = after.replace(/\btype\.([A-Za-z]+)/g, (match, key) =>
    typeMap[key] ? `type.${typeMap[key]}` : match);
  if (after !== before) {
    fs.writeFileSync(file, after, 'utf8');
    changed += 1;
  }
}
console.log(`renamed tokens in ${changed} of ${files.length} files`);
