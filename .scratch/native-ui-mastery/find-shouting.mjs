// Every place the app shouts in capitals.
import fs from 'node:fs';

for (const file of ['App.tsx', 'src/RunWorkspace.tsx', 'src/DesignStudio.tsx']) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, index) => {
    const shouts = [...line.matchAll(/toUpperCase\(\)/g)].length;
    const literals = [...line.matchAll(/'[A-Z][A-Z ]{2,}'/g)].map(match => match[0]);
    if (!shouts && !literals.length) return;
    const around = line.length > 160 ? `${line.slice(0, 80)} ... ${line.slice(-70)}` : line.trim();
    console.log(`${file}:${index + 1}  ${shouts ? `toUpperCase x${shouts}` : ''} ${literals.join(' ')}`);
    console.log(`   ${around}`);
  });
}
