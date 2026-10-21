// Which style uses which off-scale radius.
import fs from 'node:fs';

const text = fs.readFileSync('App.tsx', 'utf8');
const scale = new Set([4, 6, 8, 12]);
const re = /([A-Za-z]+):\s*\{([^}]*borderRadius:\s*(\d+)[^}]*)\}/g;
let match;
while ((match = re.exec(text))) {
  const value = Number(match[3]);
  if (scale.has(value)) continue;
  console.log(`${match[1]}: ${value}`);
}
