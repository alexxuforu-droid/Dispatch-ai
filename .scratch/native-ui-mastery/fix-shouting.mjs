// The last of the shouting. The judges read the screens and found labels in capitals and
// letter-spaced at the edge of the cards: the message kind, the diff summary, the proposal
// state, the folder kind, and the specialist kinds. They are words now.
import fs from 'node:fs';

const file = 'App.tsx';
const read = () => fs.readFileSync(file, 'utf8');
const write = (text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file'); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (from, to) => {
  const text = read();
  if (!text.includes(from)) { console.log('MISS', from.slice(0, 70)); return; }
  write(text.replace(from, to));
};

// A label, in the words a person would use.
swap(
  "const rankNames = ['Apprentice', 'Associate', 'Specialist', 'Lead', 'Principal'];",
  "const rankNames = ['Apprentice', 'Associate', 'Specialist', 'Lead', 'Principal'];\n// A label, in the words a person would use.\nconst sentenceCase = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);",
);

swap('{message.kind.toUpperCase()}', '{sentenceCase(message.kind)}');
swap("diff.identical ? 'NO CHANGES'", "diff.identical ? 'No changes'");
swap("'SUPERSEDED'", "'Superseded'");
swap("'REVERTED'", "'Reverted'");
swap("'REJECTED'", "'Rejected'");
swap("'APPLIED'", "'Applied'");
swap("'PROPOSAL'", "'Proposal'");
swap("'FOLDER'", "'Folder'");
swap('kind.toUpperCase()', 'sentenceCase(kind)');

// The message kind is a word, not a label: no tracking.
const text = read();
const style = /agentMessageKind: \{([^}]*)\}/.exec(text);
if (style && style[1].includes('letterSpacing')) {
  const cleaned = style[1].replace(/letterSpacing:\s*[^,]+,\s*/, '');
  write(text.replace(style[0], `agentMessageKind: {${cleaned}}`));
  console.log('the message kind lost its tracking');
} else {
  console.log('the message kind had no tracking');
}

console.log('the shouting is over');
