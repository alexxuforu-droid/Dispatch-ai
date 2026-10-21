// The app had forty-eight radii that were not on the scale. They move onto it by tier:
// the small ones to 4 and 8, the panels and cards to 12.
import fs from 'node:fs';

const file = 'App.tsx';
const before = fs.readFileSync(file, 'utf8');
const length = before.length;

const mapping = { 2: 4, 5: 4, 7: 8, 9: 8, 10: 12, 11: 12, 13: 12, 15: 12, 16: 12 };
let count = 0;
const after = before.replace(/borderRadius:\s*(\d+)/g, (match, value) => {
  const next = mapping[Number(value)];
  if (next === undefined) return match;
  count += 1;
  return `borderRadius: ${next}`;
});

if (after.length < length - 60) { console.log('the replacement went wrong'); process.exit(1); }
if (!after.includes('function App(') || !after.includes('StyleSheet.create')) { console.log('the file lost its content'); process.exit(1); }

fs.writeFileSync(file, after, 'utf8');
console.log(`${count} radii moved onto the scale`);
