// Second pass of the colour tokenisation: the values that were left in the two screens
// that carried their own palette.
import fs from 'node:fs';

const token = {
  '#0D1012': 'colors.page',
  '#121519': 'colors.page',
  '#12171A': 'colors.page',
  '#14171B': 'colors.surface',
  '#14171C': 'colors.surface',
  '#171E1D': 'colors.surfaceRaised',
  '#18201D': 'colors.surfaceRaised',
  '#1A2522': 'colors.surfaceRaised',
  '#1C2926': 'colors.support',
  '#22302D': 'colors.support',
  '#25302F': 'colors.support',
  '#293B36': 'colors.support',
  '#293C3B': 'colors.support',
  '#2C3E39': 'colors.support',
  '#37423F': 'colors.support',
  '#3A4146': 'colors.line',
  '#40534C': 'colors.line',
  '#48675D': 'colors.line',
  '#52605B': 'colors.line',
  '#53635E': 'colors.line',
  '#587E72': 'colors.line',
  '#5C877B': 'colors.line',
  '#33342B': 'colors.line',
  '#2D3342': 'colors.line',
  '#91A49B': 'colors.textMuted',
  '#ABC5BA': 'colors.textQuiet',
  '#B8C1BD': 'colors.textQuiet',
  '#C5DBD4': 'colors.textQuiet',
  '#CCD2CF': 'colors.textQuiet',
  '#D6E1DD': 'colors.textQuiet',
  '#D7ECE4': 'colors.text',
  '#D9E8E3': 'colors.text',
  '#D9E9E3': 'colors.text',
  '#F0F2F1': 'colors.text',
  '#FFF4D8': 'colors.text',
  '#E5C685': 'colors.attention',
};

let replaced = 0;
const unknown = new Set();
for (const file of ['src/DesignStudio.tsx', 'src/RunWorkspace.tsx']) {
  const before = fs.readFileSync(file, 'utf8');
  const after = before.replace(/#[0-9A-Fa-f]{6}\b/g, match => {
    const mapped = token[match];
    if (!mapped) { unknown.add(match); return match; }
    replaced += 1;
    return mapped;
  });
  if (after !== before) fs.writeFileSync(file, after, 'utf8');
}
console.log(`replaced ${replaced} literals`);
if (unknown.size) console.log('not mapped:', [...unknown].join(', '));
