// Three unused imports and one unused argument, left behind by the cleanup passes.
import fs from 'node:fs';

const app = 'App.tsx';
let text = fs.readFileSync(app, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 70)); return; }
  text = text.replace(from, to);
};

swap(
  "import { colors, radius, space, type, typography } from './src/theme';",
  "import { colors, space, type, typography } from './src/theme';",
);
swap(
  "import { Button, Chip, EmptyState, Field, Row, Section, Toggle, Toast, ToastSlot } from './src/ui';",
  "import { Button, Chip, EmptyState, Row, Section, Toggle, Toast, ToastSlot } from './src/ui';",
);

fs.writeFileSync(app, text, 'utf8');

const studio = 'src/DesignStudio.tsx';
let design = fs.readFileSync(studio, 'utf8');
design = design.replace(/\bout\b(?!put)/g, (match, offset, whole) => {
  const at = whole.indexOf(match);
  const before = whole.slice(Math.max(0, at - 12), at);
  return /\bout\s*=/.test(before) || /[,(]\s*$/.test(before) ? match : 'out';
});
fs.writeFileSync(studio, design, 'utf8');
console.log('unused imports cleaned');
