// Remove the style entries that nothing renders any more, in any of the component files.
import fs from 'node:fs';

const targets = [
  ['App.tsx', 'styles'],
  ['src/RunWorkspace.tsx', 'styles'],
  ['src/DesignStudio.tsx', 's'],
];

for (const [file, prefix] of targets) {
  let text = fs.readFileSync(file, 'utf8');
  const createIndex = text.indexOf('StyleSheet.create({');
  if (createIndex < 0) { console.log('no stylesheet in', file); continue; }
  const bodyStart = createIndex + 'StyleSheet.create({'.length;
  const bodyEnd = text.indexOf('});', bodyStart);
  let body = text.slice(bodyStart, bodyEnd);

  const keys = [...body.matchAll(/([A-Za-z]+):\s*\{/g)].map(match => match[1]);
  let removed = 0;
  for (const key of keys) {
    if (text.split(`${prefix}.${key}`).length - 1 > 0) continue;
    const at = body.indexOf(`${key}: {`);
    if (at < 0) continue;
    let depth = 0;
    let index = body.indexOf('{', at);
    for (; index < body.length; index += 1) {
      if (body[index] === '{') depth += 1;
      else if (body[index] === '}') { depth -= 1; if (depth === 0) break; }
    }
    let end = index + 1;
    if (body.slice(end, end + 2) === ', ') end += 2;
    else if (body[end] === ',') end += 1;
    body = body.slice(0, at) + body.slice(end);
    removed += 1;
  }

  text = text.slice(0, bodyStart) + body + text.slice(bodyEnd);
  fs.writeFileSync(file, text, 'utf8');
  console.log(file, 'removed', removed, 'dead styles');
}
