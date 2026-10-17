import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = await readFile(path.join(here, '..', 'assets', 'dispatch-mark.svg'), 'utf8');
const png = new Resvg(source, {
  fitTo: { mode: 'width', value: 768 },
  background: '#14161B',
}).render().asPng();
await writeFile(path.join(here, '..', 'assets', 'dispatch-mark.png'), png);
console.log('Rendered the supplied Dispatch mark at 768px.');
