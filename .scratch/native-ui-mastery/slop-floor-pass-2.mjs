// The last of the slop floor: every remaining tinted surface is a selected state, so it
// becomes a neutral surface with a stronger border, and the letter-spaced labels lose
// their tracking.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

// A selected state is a neutral surface, not a tinted one.
text = text.replace(/backgroundColor: colors\.support/g, 'backgroundColor: colors.surfaceActive');
text = text.replace(/borderColor: colors\.lead,/g, 'borderColor: colors.textMuted,');

// The letter-spaced labels.
text = text.replace(/letterSpacing: (?:0?\.[0-9]+|[1-9][0-9]*), /g, (match) => (Number(match.match(/[\d.]+/)[0]) >= 0.8 ? '' : match));

fs.writeFileSync(file, text, 'utf8');
console.log('slop floor pass applied');
