// One-shot: raise the sub-10px type floor on the review surfaces to the theme's caption
// step (10px). Small text that scales from 8px is unreadable before Windows text scaling
// even starts, and the design judge flagged the floor directly.
import fs from 'node:fs';

const edits = [
  ['App.tsx', [
    // code proposal card
    ["codeProposalMeta: { color: colors.secondary, fontFamily: typography.body, fontSize: 9, marginTop: 3 }",
     "codeProposalMeta: { color: colors.secondary, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 3 }"],
    ["codeProposalLabel: { color: colors.accent, fontFamily: typography.body, fontSize: 8, letterSpacing: 1, fontWeight: '700', marginTop: 3 }",
     "codeProposalLabel: { color: colors.accent, fontFamily: typography.body, fontSize: 10, letterSpacing: .8, fontWeight: '700', marginTop: 4 }"],
    ["codeProposalApplied: { color: colors.accent, fontFamily: typography.body, fontSize: 10 }",
     "codeProposalApplied: { color: colors.accent, fontFamily: typography.body, fontSize: 11, lineHeight: 16 }"],
    // run thread
    ["threadLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 8, letterSpacing: 1.2, fontWeight: '700', marginBottom: 6 }",
     "threadLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: 1, fontWeight: '700', marginBottom: 6 }"],
    ["runStatusText: { color: colors.secondary, fontFamily: typography.body, fontSize: 9 }",
     "runStatusText: { color: colors.secondary, fontFamily: typography.body, fontSize: 10 }"],
    ["threadKicker: { color: colors.muted, fontFamily: typography.body, fontSize: 9, letterSpacing: 1.3, fontWeight: '700' }",
     "threadKicker: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: 1.1, fontWeight: '700' }"],
    ["planAgent: { color: colors.muted, fontFamily: typography.body, fontSize: 8, marginTop: 2 }",
     "planAgent: { color: colors.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 14, marginTop: 2 }"],
    ["planState: { color: colors.secondary, fontFamily: typography.body, fontSize: 8 }",
     "planState: { color: colors.secondary, fontFamily: typography.body, fontSize: 10 }"],
    ["agentMessageKind: { color: colors.muted, fontFamily: typography.body, fontSize: 8, letterSpacing: .8 }",
     "agentMessageKind: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: .6 }"],
    // inspector
    ["needsModelText: { color: colors.muted, fontFamily: typography.body, fontSize: 8, letterSpacing: .8 }",
     "needsModelText: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: .6 }"],
    ["autoTagText: { color: colors.accent, fontFamily: typography.body, fontSize: 8, letterSpacing: .8, fontWeight: '700' }",
     "autoTagText: { color: colors.accent, fontFamily: typography.body, fontSize: 10, letterSpacing: .6, fontWeight: '700' }"],
    ["toggleDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 9, marginTop: 3 }",
     "toggleDetail: { color: colors.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 15, marginTop: 3 }"],
    ["outputText: { color: colors.muted, fontFamily: typography.body, fontSize: 9 }",
     "outputText: { color: colors.muted, fontFamily: typography.body, fontSize: 10 }"],
    ["textAction: { color: colors.accent, fontFamily: typography.body, fontSize: 11, fontWeight: '600', paddingHorizontal: 5, paddingVertical: 4 }",
     "textAction: { color: colors.accent, fontFamily: typography.body, fontSize: 11, fontWeight: '600', paddingHorizontal: 5, paddingVertical: 6 }"],
    // avatars
    ["avatarChooseLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 7, letterSpacing: .6 }",
     "avatarChooseLabel: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: .4 }"],
    ["avatarOptionNumber: { color: colors.muted, fontFamily: typography.body, fontSize: 8, letterSpacing: .5 }",
     "avatarOptionNumber: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: .4 }"],
    // image artifacts
    ["imageArtifactTag: { color: colors.accent, fontFamily: typography.body, fontSize: 8, letterSpacing: .8 }",
     "imageArtifactTag: { color: colors.accent, fontFamily: typography.body, fontSize: 10, letterSpacing: .6 }"],
    ["imageArtifactPath: { color: colors.muted, fontFamily: typography.body, fontSize: 8, marginTop: 8 }",
     "imageArtifactPath: { color: colors.muted, fontFamily: typography.body, fontSize: 10, lineHeight: 14, marginTop: 8 }"],
    // plugin cards
    ["pluginCategory: { color: colors.muted, fontFamily: typography.body, fontSize: 8, letterSpacing: 1.1, fontWeight: '700' }",
     "pluginCategory: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: .9, fontWeight: '700' }"],
    ["pluginStatus: { color: colors.muted, fontFamily: typography.body, fontSize: 8, letterSpacing: .7 }",
     "pluginStatus: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: .5 }"],
    // mission prompt cards
    ["promptCardMeta: { color: colors.accent, fontFamily: typography.body, fontSize: 8, fontWeight: '700', marginTop: 8 }",
     "promptCardMeta: { color: colors.accent, fontFamily: typography.body, fontSize: 10, lineHeight: 14, fontWeight: '700', marginTop: 8 }"],
    // team role state
    ["savedRoleState: { color: colors.muted, fontFamily: typography.body, fontSize: 8, letterSpacing: .8 }",
     "savedRoleState: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: .6 }"],
    ["agentCardStatus: { color: colors.muted, fontFamily: typography.body, fontSize: 8, letterSpacing: .8 }",
     "agentCardStatus: { color: colors.muted, fontFamily: typography.body, fontSize: 10, letterSpacing: .6 }"],
    // modal eyebrow
    ["modalEyebrow: { color: colors.accent, fontFamily: typography.body, fontSize: 9, letterSpacing: 1.5, fontWeight: '700' }",
     "modalEyebrow: { color: colors.accent, fontFamily: typography.body, fontSize: 10, letterSpacing: 1.3, fontWeight: '700' }"],
  ]],
  ['src/RunWorkspace.tsx', [
    ["diffLabel: { color: colors.accent, fontFamily: typography.body, fontSize: 10, fontWeight: '700', marginTop: 5 }",
     "diffLabel: { color: colors.accent, fontFamily: typography.body, fontSize: 10, fontWeight: '700', letterSpacing: .6, marginTop: 5 }"],
    ["activityText: { color: colors.secondary, fontFamily: typography.body, fontSize: 11, lineHeight: 17, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }",
     "activityText: { color: colors.secondary, fontFamily: typography.body, fontSize: 12, lineHeight: 18, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }"],
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
