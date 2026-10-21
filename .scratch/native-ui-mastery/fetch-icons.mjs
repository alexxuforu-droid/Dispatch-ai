// One-shot: fetch the Tabler icon sources into assets/icons/svg.
import { mkdir, writeFile } from 'node:fs/promises';
import https from 'node:https';

const names = ['robot', 'users', 'user', 'player-play', 'checklist', 'file', 'photo', 'settings',
  'sparkles', 'plus', 'send', 'x', 'check', 'search', 'folder', 'chevron-right', 'shield',
  'alert-triangle', 'square', 'layout-kanban', 'chart-bar', 'template', 'palette',
  'arrow-up-right', 'layout-list', 'world'];

const target = 'assets/icons/svg';
await mkdir(target, { recursive: true });

const fetchOne = name => new Promise((resolve, reject) => {
  const url = `https://unpkg.com/@tabler/icons@3.31.0/icons/outline/${name}.svg`;
  https.get(url, response => {
    if (response.statusCode !== 200) { reject(new Error(`${name}: ${response.statusCode}`)); return; }
    let body = '';
    response.on('data', chunk => { body += chunk; });
    response.on('end', () => resolve(body));
  }).on('error', reject);
});

let count = 0;
for (const name of names) {
  try {
    const svg = await fetchOne(name);
    await writeFile(`${target}/${name}.svg`, svg, 'utf8');
    count += 1;
  } catch (error) {
    console.log('skipped', error.message);
  }
}
console.log(`fetched ${count} icons`);
