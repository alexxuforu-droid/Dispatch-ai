// The last eyebrow labels: the kicker above the run plan and the ones above the dialog
// titles. The title says what the dialog is; the label above it was decoration.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const before = text;
text = text.replace(/<Text style=\{styles\.threadKicker\}>[^<]*<\/Text>/g, '');
text = text.replace(/<Text style=\{styles\.modalEyebrow\}>[^<]*<\/Text>/g, '');

// Two labels that keep their words but lose the tracking.
text = text.replace(
  "usageTotalLabel: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, letterSpacing: 1.1, fontWeight: '700' }",
  "usageTotalLabel: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, fontWeight: '600' }",
);
text = text.replace(
  "runCardStatus: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '700', letterSpacing: .8 }",
  "runCardStatus: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '600' }",
);

fs.writeFileSync(file, text, 'utf8');
console.log(before === text ? 'no change' : 'eyebrows removed');
