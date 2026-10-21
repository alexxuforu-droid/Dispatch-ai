// The design studio kept its own radius scale. The plan has one radius per tier, so the
// studio's corners move onto it: 7 and 9 become 8, 11 and 13 become 12, 20 becomes 12, and
// 2 becomes 4. The change is a corner, nothing else.
import fs from 'node:fs';

const file = 'src/DesignStudio.tsx';
const before = fs.readFileSync(file, 'utf8');
const length = before.length;

const mapping = { 2: 4, 7: 8, 9: 8, 11: 12, 13: 12, 20: 12 };
let after = before.replace(/borderRadius:\s*(\d+)/g, (match, value) => {
  const next = mapping[Number(value)];
  return next === undefined ? match : `borderRadius: ${next}`;
});

if (after.length < length - 40) { console.log('the replacement went wrong'); process.exit(1); }
if (!after.includes('export function DesignStudio')) { console.log('the file lost its content'); process.exit(1); }

fs.writeFileSync(file, after, 'utf8');
console.log('the studio corners are on the radius scale');
