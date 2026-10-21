// The Dispatch screen styles: one measure, one hierarchy, no centred column.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 70)); return; }
  text = text.replace(from, to);
};

// The page frame: padding on the page, content left aligned inside it.
swap(
  "chatContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingTop: 35, paddingBottom: 25 }",
  "chatContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 24 }",
);
swap(
  "chatHero: { width: '100%', maxWidth: 690, alignSelf: 'center' }",
  "chatHero: { width: '100%', maxWidth: 760 }",
);
swap(
  "heroMark: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 17 }, heroEyebrow: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, letterSpacing: 1.5, fontWeight: '700' }",
  '',
);
swap(
  "heroTitle: { color: colors.text, fontFamily: typography.display, fontSize: 43, fontWeight: '600', lineHeight: 51, letterSpacing: -1.4 }",
  "heroTitle: { color: colors.text, fontFamily: typography.display, fontSize: 28, fontWeight: '600', lineHeight: 34, letterSpacing: -0.5 }",
);
swap(
  "heroBody: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 15, lineHeight: 23, maxWidth: 510, marginTop: 13 }",
  "heroBody: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 14, lineHeight: 20, maxWidth: 540, marginTop: 12 }",
);
swap(
  "promptSection: { width: '100%', maxWidth: 690, alignSelf: 'center', marginTop: 40 }",
  "promptSection: { width: '100%', maxWidth: 760, marginTop: 32 }",
);
swap(
  "promptRows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }",
  "promptRows: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }",
);
swap(
  "promptCard: { flexGrow: 1, flexBasis: 220, maxWidth: 320, minHeight: 100, padding: 12, marginTop: 8, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 9 }",
  "promptCard: { flexGrow: 1, flexBasis: 240, maxWidth: 360, minHeight: 108, padding: 16, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 12 }",
);
swap(
  "prompt: { minHeight: 37, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }",
  "prompt: { minHeight: 36, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceRaised, borderRadius: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center' }",
);

// The composer sits on the same measure as the content above it.
swap(
  "composerArea: { width: '100%', maxWidth: 750, alignSelf: 'center', paddingHorizontal: 25, paddingBottom: 18 }",
  "composerArea: { width: '100%', maxWidth: 808, paddingHorizontal: 24, paddingBottom: 20 }",
);
swap(
  "composer: { minHeight: 132, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 13, paddingHorizontal: 15, paddingTop: 12, paddingBottom: 10 }",
  "composer: { minHeight: 124, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }",
);

// The send button is the shared Button now.
swap(
  "sendButton: { minHeight: 34, paddingHorizontal: 11, borderRadius: 7, backgroundColor: colors.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: 9 }, sendButtonEnabled: { backgroundColor: colors.text }, sendLabel: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, fontWeight: '600' }, sendLabelEnabled: { color: colors.page }",
  '',
);
swap(' style={styles.sendButton} />', ' />');

// The notice banner is a toast now.
swap(
  "notice: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 13, paddingVertical: 10, marginBottom: 9, borderRadius: 8, backgroundColor: colors.attentionSurface, borderWidth: 1, borderColor: colors.attentionSurface }, noticeText: { color: colors.attention, fontFamily: typography.body, fontSize: 11, lineHeight: 16, flex: 1, marginRight: 10 }, noticeDismiss: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', borderRadius: 6 }",
  '',
);

fs.writeFileSync(file, text, 'utf8');
console.log('dispatch styles updated');
