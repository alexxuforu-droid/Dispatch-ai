// Raise every line height that is now tighter than its own font size.
//
// The type-floor pass moved font sizes from 7-9px up to 10px, but left the old line heights
// behind. A line height at or below the font size makes wrapped lines touch or clip, which
// defeats the legibility the floor was for. This lifts any line height under 1.3x its font
// size, which is the usual minimum for readable body copy.
import fs from 'node:fs';

const files = ['App.tsx', 'src/DesignStudio.tsx', 'src/RunWorkspace.tsx', 'src/Reveal.tsx'];
let raised = 0;
for (const file of files) {
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  // Only pairs inside the same style object are considered, so a font size is matched with
  // the line height that belongs to it.
  text = text.replace(/fontSize: (\d+(?:\.\d+)?), lineHeight: (\d+(?:\.\d+)?)/g, (match, size, height) => {
    const font = Number(size);
    const line = Number(height);
    const minimum = Math.round(font * 1.3);
    if (line >= minimum) return match;
    raised += 1;
    return `fontSize: ${size}, lineHeight: ${minimum}`;
  });
  if (text !== before) { fs.writeFileSync(file, text, 'utf8'); console.log(`updated ${file}`); }
}
console.log(`raised ${raised} line heights`);
