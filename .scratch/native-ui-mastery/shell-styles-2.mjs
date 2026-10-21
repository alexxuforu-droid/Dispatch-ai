// One-shot: finish the shell style pass after the first pass missed two entries.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (from instanceof RegExp) {
    if (!from.test(text)) { console.log('MISS:', String(from).slice(0, 60)); return; }
    text = text.replace(from, to);
    return;
  }
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 60)); return; }
  text = text.replace(from, to);
};

// The status dot is gone: the word carries the state.
swap(
  "statusPip: { width: 7, height: 7, borderRadius: 4 }, statusPipOn: { backgroundColor: colors.text }, statusPipOff: { backgroundColor: colors.attention }, ",
  "",
);

// The connection card repeated what the app already says, with a decorative dot.
swap(/connectionCard: \{[^}]*\}, connectionTop: \{[^}]*\}, offlineDot: \{[^}]*\}, engineReadyDot: \{[^}]*\}, connectionLabel: \{[^}]*\}, connectionText: \{[^}]*\}, connectionHint: \{[^}]*\}, /, "");

// A stray separator left by the first pass.
swap("statusText: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11 }, ,", "statusText: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11 },");

fs.writeFileSync(file, text, 'utf8');
console.log('shell styles finished');
