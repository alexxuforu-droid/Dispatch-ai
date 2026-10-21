// One-shot: the shell styles for the new sidebar and top bar.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 60)); return; }
  text = text.replace(from, to);
};

// The group label that replaces the WORKSPACE eyebrow: sentence case, no tracking.
swap(
  "navLabel: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, letterSpacing: 1.3, marginHorizontal: 9, marginBottom: 8 }",
  "navGroup: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 16, marginBottom: 6, marginHorizontal: 10 }",
);

// The brand caption is a sentence now, so it carries no tracking.
swap(
  "brandCaption: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, letterSpacing: 1.65, marginTop: 1 }",
  "brandCaption: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 1 }",
);

// The top bar holds the page title. The breadcrumb repeated the app's own name.
swap(
  "crumb: { flexDirection: 'row', alignItems: 'center', gap: 10 }, crumbMuted: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 }, crumbSlash: { color: colors.lineStrong, fontFamily: typography.body, fontSize: 14 }, crumbCurrent: { color: colors.text, fontFamily: typography.body, fontSize: 12, fontWeight: '600' }",
  "topbarTitle: { color: colors.text, fontFamily: typography.body, fontSize: 13, fontWeight: '600' }",
);

// The status dot, the account circle and the connection card are gone: a word carries the
// state, an account is a row, and the card repeated what the app already says.
swap(
  "statusPip: { width: 7, height: 7, borderRadius: 4 }, statusPipOn: { backgroundColor: colors.lead }, statusPipOff: { backgroundColor: colors.attention }, ",
  "",
);
swap(" topbarDivider: { width: 1, height: 20, backgroundColor: colors.line, marginHorizontal: 7 },", "");
swap(
  "avatarButton: { width: 27, height: 27, borderRadius: 14, backgroundColor: colors.surfaceActive, justifyContent: 'center', alignItems: 'center' }, avatarText: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '700' }",
  "",
);
swap(
  "profileAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surfaceActive, justifyContent: 'center', alignItems: 'center' }, profileInitials: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 13, fontWeight: '700' }, ",
  "",
);
swap(
  "connectionCard: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 15, paddingHorizontal: 4, marginTop: 7, marginBottom: 4 }, connectionTop: { flexDirection: 'row', alignItems: 'center', gap: 7 }, offlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.attention }, engineReadyDot: { backgroundColor: colors.lead }, connectionLabel: { color: colors.textMuted, fontSize: 11, letterSpacing: 1.1, fontFamily: typography.body }, connectionText: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 12, marginTop: 9 }, connectionHint: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 3, lineHeight: 16 }, ",
  "",
);

// The account row is a row now, and it sits under the settings item.
swap(
  "profile: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 11, marginTop: 4 }, profileCompact: { justifyContent: 'center', width: 48 }",
  "profile: { flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12, marginTop: 4 }",
);

fs.writeFileSync(file, text, 'utf8');
console.log('shell styles updated');
