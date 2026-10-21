// Repair pass: the colour tokenisation wrote token names as quoted strings inside style
// objects, which is not a colour value. A style needs the identifier, not the text.
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
let repaired = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/'colors\.([A-Za-z]+)'/g, (match, key) => {
    repaired += 1;
    return `colors.${key}`;
  });
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
}
console.log(`repaired ${repaired} quoted token strings`);
