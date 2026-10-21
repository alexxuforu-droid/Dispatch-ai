// Which style still carries the tracking the checker warns about?
import fs from 'node:fs';

const text = fs.readFileSync('App.tsx', 'utf8');
const re = /([A-Za-z]+):\s*\{[^}]*letterSpacing:\s*(0?\.[0-9]+|[1-9][0-9]*)[^}]*\}/g;
let match;
while ((match = re.exec(text))) {
  if (Number(match[2]) >= 0.8) console.log(match[1], match[2]);
}
