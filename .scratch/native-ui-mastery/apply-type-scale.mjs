// One-shot: point the two review surfaces at the theme's semantic type scale, so the
// scale is the stylesheet's vocabulary rather than a parallel set of numbers.
import fs from 'node:fs';

const edits = [
  ['App.tsx', [
    ["import { colors, typography } from './src/theme';", "import { colors, type, typography } from './src/theme';"],
    ["codeProposalPath: { color: colors.ink, fontFamily: 'Cascadia Code', fontSize: 11, fontWeight: '600' }",
     "codeProposalPath: { ...type.code, color: colors.ink, fontWeight: '600' }"],
    ["codeProposalMeta: { color: colors.secondary, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 3 }",
     "codeProposalMeta: { ...type.caption, color: colors.secondary, lineHeight: 15, marginTop: 3 }"],
    ["codeProposalLabel: { color: colors.accent, fontFamily: typography.body, fontSize: 10, letterSpacing: .8, fontWeight: '700', marginTop: 4 }",
     "codeProposalLabel: { ...type.caption, color: colors.accent, letterSpacing: .8, fontWeight: '700', marginTop: 4 }"],
    ["codeProposalText: { color: '#DCE4E2', fontFamily: 'Cascadia Code', fontSize: 10, lineHeight: 15 }",
     "codeProposalText: { ...type.codeSmall, color: '#DCE4E2' }"],
    ["codeProposalApplied: { color: colors.accent, fontFamily: typography.body, fontSize: 11, lineHeight: 16 }",
     "codeProposalApplied: { ...type.label, color: colors.accent }"],
    ["codeProposalLineNumber: { width: 32, color: colors.muted, fontFamily: 'Cascadia Code', fontSize: 10, lineHeight: 15, marginRight: 8, marginTop: 5 }",
     "codeProposalLineNumber: { ...type.codeSmall, width: 32, color: colors.muted, marginRight: 8, marginTop: 5 }"],
  ]],
  ['src/RunWorkspace.tsx', [
    ["import { colors, typography } from './theme';", "import { colors, type, typography } from './theme';"],
    ["code: { color: colors.ink, fontFamily: 'Cascadia Code', fontSize: 11, lineHeight: 16, maxWidth: 850, marginTop: 5 }",
     "code: { ...type.code, color: colors.ink, maxWidth: 850, marginTop: 5 }"],
    ["lineNumber: { width: 32, color: colors.muted, fontFamily: 'Cascadia Code', fontSize: 11, lineHeight: 16, marginRight: 8, marginTop: 5 }",
     "lineNumber: { ...type.code, width: 32, color: colors.muted, marginRight: 8, marginTop: 5 }"],
    ["diffLabel: { color: colors.accent, fontFamily: typography.body, fontSize: 10, fontWeight: '700', letterSpacing: .6, marginTop: 5 }",
     "diffLabel: { ...type.caption, color: colors.accent, fontWeight: '700', letterSpacing: .6, marginTop: 5 }"],
    ["body: { color: colors.secondary, fontFamily: typography.body, fontSize: 13, lineHeight: 19 }",
     "body: { ...type.body, color: colors.secondary }"],
    ["dim: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 19 }",
     "dim: { ...type.body, color: colors.muted }"],
    ["name: { color: colors.ink, fontFamily: typography.body, fontSize: 13, fontWeight: '700' }",
     "name: { ...type.body, color: colors.ink, fontWeight: '700' }"],
  ]],
];

for (const [file, pairs] of edits) {
  let text = fs.readFileSync(file, 'utf8');
  for (const [from, to] of pairs) {
    if (!text.includes(from)) { console.error(`MISS ${file}: ${from.slice(0, 60)}`); continue; }
    text = text.replace(from, to);
  }
  fs.writeFileSync(file, text, 'utf8');
  console.log(`updated ${file}`);
}
