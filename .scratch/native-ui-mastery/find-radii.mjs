// Which radii are off the scale, and where.
import fs from 'node:fs';

const files = ['App.tsx', 'src/ui.tsx', 'src/RunWorkspace.tsx', 'src/DesignStudio.tsx', 'src/Reveal.tsx'];
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const values = {};
  for (const match of text.matchAll(/borderRadius:\s*(\d+(?:\.\d+)?)/g)) {
    values[match[1]] = (values[match[1]] ?? 0) + 1;
  }
  console.log(file, Object.entries(values).sort((a, b) => Number(a[0]) - Number(b[0])).map(([value, count]) => `${value}x${count}`).join('  '));
}
