// The status dots that sit beside a word that already says the same thing, and the last
// letter-spaced labels. The grip dots on a draggable canvas card stay: that is a handle,
// not a status.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 80)); return; }
  text = text.replace(from, to);
};

// The run status dot: the word beside it says the same thing.
swap(
  "<View style={[styles.runStatusDot, run.status === 'completed' && styles.runStatusDotDone, run.status === 'cancelled' && styles.runStatusDotMuted]} />",
  '',
);
// The planning dot.
swap('<View style={styles.planningDot} />', '');
// The provider dot.
swap('<View style={[styles.providerDot, hasSavedKey && styles.providerDotSaved]} />', '');

// The letter-spaced labels, wherever they sit in their style.
text = text.replace(/letterSpacing:\s*(?:0?\.[0-9]+|[1-9][0-9]*)(?=[,}])/g, (match) => (Number(match.match(/[\d.]+/)[0]) >= 0.8 ? '' : match));
text = text.replace(/,\s*,/g, ',');

fs.writeFileSync(file, text, 'utf8');
console.log('dots and tracking removed');
