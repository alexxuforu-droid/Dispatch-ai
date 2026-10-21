// The two swaps the last pass missed, plus the test that asserted a heading that is now
// in the top bar.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 80)); return; }
  write(file, text.replace(from, to));
};

// The top bar's title carries the page name now, at its own size.
swap('App.tsx',
  "topbarTitle: { color: colors.text, fontFamily: typography.body, fontSize: 13, fontWeight: '600' }",
  "topbarTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20, fontWeight: '600' }");

// The board's statuses are words, not shouts.
swap('App.tsx',
  "const statusLabel = (status: string) => ({ ready: 'READY', running: 'WORKING', blocked: 'BLOCKED', done: 'DONE', failed: 'FAILED', cancelled: 'CANCELLED', 'needs-approval': 'REVIEW' }[status] ?? status.toUpperCase());",
  "const statusLabel = (status: string) => ({ ready: 'Ready', running: 'Working', blocked: 'Blocked', done: 'Done', failed: 'Failed', cancelled: 'Cancelled', 'needs-approval': 'Review' }[status] ?? status);");

console.log('the two misses are fixed');
