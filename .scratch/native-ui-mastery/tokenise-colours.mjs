// One-shot replacement of the ad-hoc colour literals with tokens from src/theme.ts.
//
// Every one of these values was written by hand at some point, which is how the app ended
// up with more than twenty surfaces that were almost the same colour. The screens get
// rewritten against the tokens in the later phases; this keeps the app honest in between.
import fs from 'node:fs';
import path from 'node:path';

const token = {
  '#0E1115': 'colors.page',
  '#101419': 'colors.page',
  '#111419': 'colors.page',
  '#12151A': 'colors.surface',
  '#15181D': 'colors.surface',
  '#15191D': 'colors.surface',
  '#171A1F': 'colors.surface',
  '#171B1E': 'colors.surface',
  '#181B20': 'colors.surface',
  '#191D23': 'colors.surfaceRaised',
  '#1B1F25': 'colors.surfaceRaised',
  '#1E2526': 'colors.surfaceActive',
  '#29252D': 'colors.surfaceActive',
  '#2B2B25': 'colors.surfaceActive',
  '#343A43': 'colors.surfaceActive',
  '#313A3B': 'colors.surfaceActive',
  '#18231F': 'colors.support',
  '#192522': 'colors.support',
  '#1B2826': 'colors.support',
  '#1C2827': 'colors.support',
  '#1C302D': 'colors.support',
  '#1D2827': 'colors.support',
  '#1D2927': 'colors.support',
  '#1E2928': 'colors.support',
  '#1F302D': 'colors.support',
  '#243833': 'colors.support',
  '#253631': 'colors.support',
  '#263935': 'colors.support',
  '#17201F': 'colors.support',
  '#211E19': 'colors.attentionSurface',
  '#24231F': 'colors.attentionSurface',
  '#342A23': 'colors.attentionSurface',
  '#382522': 'colors.criticalSurface',
  '#34483E': 'colors.line',
  '#36574F': 'colors.line',
  '#3B6258': 'colors.line',
  '#3F7569': 'colors.line',
  '#42665B': 'colors.line',
  '#44645E': 'colors.line',
  '#554932': 'colors.line',
  '#65513A': 'colors.line',
  '#DCE4E2': 'colors.text',
  '#D7D8DB': 'colors.text',
  '#F1F4F3': 'colors.text',
  '#CCD0D3': 'colors.textQuiet',
  '#CCD2D1': 'colors.textQuiet',
  '#C6D8D3': 'colors.textQuiet',
  '#D3D6D9': 'colors.textQuiet',
  '#5E9D8D': 'colors.textQuiet',
  '#E6B7A8': 'colors.critical',
  '#E9CEA2': 'colors.attention',
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = [...walk('src'), 'App.tsx'];
let replaced = 0;
const unknown = new Set();
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/#[0-9A-Fa-f]{6}\b/g, match => {
    const mapped = token[match];
    if (!mapped) { unknown.add(match); return match; }
    replaced += 1;
    return mapped;
  });
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
}
console.log(`replaced ${replaced} literals across ${files.length} files`);
if (unknown.size) console.log('not mapped:', [...unknown].join(', '));
