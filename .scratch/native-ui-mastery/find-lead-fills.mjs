// Which styles now fill with the lead, and what they are.
import fs from 'node:fs';

for (const file of ['App.tsx', 'src/ui.tsx', 'src/DesignStudio.tsx']) {
  const text = fs.readFileSync(file, 'utf8');
  const re = /([A-Za-z]+):\s*\{([^}]*backgroundColor:\s*colors\.lead[^}]*)\}/g;
  let match;
  while ((match = re.exec(text))) {
    console.log(`${file}: ${match[1]}`);
  }
}
