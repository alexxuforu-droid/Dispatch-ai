// Remove the stray separators left by removing style entries.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');
const before = text;
text = text.replace(/}, , /g, '}, ');
text = text.replace(/, , /g, ', ');
fs.writeFileSync(file, text, 'utf8');
console.log(before === text ? 'no stray separators' : 'separators fixed');
