// The app's own hand rolled buttons were still white blocks, because they were not the
// shared Button. They are the lead now, with near-black ink, so there is no white fill left
// in the interface and one accent lands per screen.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 90)); return; }
  write(file, text.replace(from, to));
};

// ---- the app's white fills become the lead, and their labels become the ink on it ----------
const app = 'App.tsx';
let text = read(app);
text = text.replace(/backgroundColor: colors\.text\b/g, 'backgroundColor: colors.lead');
write(app, text);
console.log('the app fills: every white block is now the lead');

// The labels that sat on those blocks were near-black; they stay near-black, which is the
// ink on the lead.
const ui = 'src/ui.tsx';
let shared = read(ui);
shared = shared.replace(/backgroundColor: colors\.text\b/g, 'backgroundColor: colors.lead');
write(ui, shared);
console.log('the shared set: every white block is now the lead');

const studio = 'src/DesignStudio.tsx';
let design = read(studio);
design = design.replace(/backgroundColor: colors\.text\b/g, 'backgroundColor: colors.lead');
write(studio, design);
console.log('the design studio: every white block is now the lead');
