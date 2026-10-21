// The last of the slop floor in the app: tinted chips, letter-spaced labels and the status
// dots that sit beside a word that already says it.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 80)); return; }
  text = text.replace(from, to);
};

// A selected chip is a neutral surface with a stronger border.
swap(
  "teamChipActive: { borderColor: colors.textMuted, backgroundColor: colors.surfaceActive }",
  "teamChipActive: { borderColor: colors.textMuted, backgroundColor: colors.surfaceActive }",
);
swap(
  "agentRankOptionActive: { backgroundColor: colors.support, borderColor: colors.lead }",
  "agentRankOptionActive: { backgroundColor: colors.surfaceActive, borderColor: colors.textMuted }",
);
swap(
  "pluginCard: { flexGrow: 1, flexBasis: 320, minHeight: 180, padding: 17, borderRadius: 11, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }",
  "pluginCard: { flexGrow: 1, flexBasis: 320, minHeight: 180, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface }",
);
swap(
  "pluginNotice: { width: '100%', maxWidth: 860, alignSelf: 'center', padding: 15, marginTop: 14, backgroundColor: colors.support, borderWidth: 1, borderColor: colors.line, borderRadius: 10 }",
  "pluginNotice: { width: '100%', maxWidth: 860, alignSelf: 'center', padding: 16, marginTop: 16, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: 12 }",
);
swap(
  "savedTeamCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 18, paddingTop: 17, paddingBottom: 8 }",
  "savedTeamCard: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12 }",
);
swap(
  "teamSavedCardActive: { borderColor: colors.lead, backgroundColor: colors.support }",
  "teamSavedCardActive: { borderColor: colors.textMuted, backgroundColor: colors.surfaceActive }",
);
swap(
  "agentCard: { width: 240, minHeight: 205, padding: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 10 }",
  "agentCard: { width: 250, minHeight: 200, padding: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 12 }",
);
swap(
  "skillChipActive: { borderColor: colors.line, backgroundColor: colors.surfaceRaised }",
  "skillChipActive: { borderColor: colors.textMuted, backgroundColor: colors.surfaceActive }",
);

// The letter-spaced labels that survived.
for (const name of ['promptHeading', 'threadLabel', 'collectionPath', 'runCardStatus']) {
  const re = new RegExp(`(${name}: \\{[^}]*?)letterSpacing: (?:0?\\.[0-9]+|[1-9][0-9]*), `, 'g');
  text = text.replace(re, '$1');
}

fs.writeFileSync(file, text, 'utf8');
console.log('slop floor pass done');
