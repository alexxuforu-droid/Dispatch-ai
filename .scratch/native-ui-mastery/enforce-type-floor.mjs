// One-shot: raise every remaining sub-10px font size to the 10px caption floor.
// Small text that Windows text scaling grows from 8px is unreadable before scaling
// even starts, and the theme documents a 10px floor. A script keeps the sweep honest
// across 178 declarations in App.tsx and 52 in DesignStudio.tsx.
import fs from 'node:fs';

const files = ['App.tsx', 'src/DesignStudio.tsx', 'src/RunWorkspace.tsx', 'src/Reveal.tsx'];
let raised = 0;
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  text = text.replace(/fontSize: (\d+(?:\.\d+)?)(?=,)/g, (match, size) => {
    const value = Number(size);
    if (value >= 10) return match;
    raised += 1;
    return 'fontSize: 10';
  });
  if (text !== before) {
    fs.writeFileSync(file, text, 'utf8');
    console.log(`updated ${file}`);
  }
}
console.log(`raised ${raised} declarations to the 10px floor`);
