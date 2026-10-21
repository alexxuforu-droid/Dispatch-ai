// The design studio, brought onto the same rules as the rest of the app: no uppercase
// letter-spaced labels, no numbered section titles, no decorative grid or shadow, no dot
// beside a word.
import fs from 'node:fs';

const file = 'src/DesignStudio.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 70)); return; }
  text = text.replace(from, to);
};

// The heading loses its kicker and its status pill: the title and one line say it.
swap(
  '<View style={s.headingRow}><View style={{ flex: 1 }}><Text style={s.kicker}>STUDIO / AGENT COLLABORATION</Text><Text style={s.title}>Design workspace</Text><Text style={s.subtitle}>Show the team what you mean. Arrange references, call out exact changes, and send the whole canvas as a structured brief.</Text></View><View style={s.livePill}><View style={s.liveDot}/><Text style={s.liveText}>Brief syncs to agent chat</Text></View></View>',
  '<View style={s.headingRow}><View style={{ flex: 1 }}><Text style={s.title}>Design workspace</Text><Text style={s.subtitle}>Show the team what you mean. Arrange references, call out exact changes, and send the whole canvas as a structured brief.</Text></View></View>',
);

// The section numbers were decoration: the order of these sections is not a sequence.
swap(
  '<SectionTitle index="01" title="Starting point" />',
  '<SectionTitle title="Starting point" />',
);
swap(
  '<SectionTitle index="02" title="3D prompt recipes" note="Text prompts only · add to canvas" />',
  '<SectionTitle title="3D prompt recipes" note="Text prompts only, added to the canvas" />',
);
swap(
  '<SectionTitle index="03" title="Design skills" note="Select the lenses you want the team to apply" />',
  '<SectionTitle title="Design skills" note="Select the lenses you want the team to apply" />',
);
swap(
  `function SectionTitle({ index, title, note }: { index: string; title: string; note?: string }) {
  return <View style={s.sectionTitleRow}><View style={s.sectionNumber}><Text style={s.sectionNumberText}>{index}</Text></View><View style={{ flex: 1 }}><Text style={s.sectionHeading}>{title}</Text>{note && <Text style={s.sectionNote}>{note}</Text>}</View></View>;
}`,
  `function SectionTitle({ title, note }: { title: string; note?: string }) {
  return <View style={s.sectionTitleRow}><View style={{ flex: 1 }}><Text style={s.sectionHeading}>{title}</Text>{note && <Text style={s.sectionNote}>{note}</Text>}</View></View>;
}`,
);

// The canvas had a decorative grid and crosshairs drawn over it.
swap(
  '<View pointerEvents="none" style={s.gridOverlay}/><View pointerEvents="none" style={s.stageAxisX}/><View pointerEvents="none" style={s.stageAxisY}/>\n          ',
  '',
);
swap(
  '<View pointerEvents="none" style={s.stageCorner}><Text style={s.stageCornerText}>CANVAS / 01</Text></View>',
  '',
);

// A card with a border does not also need a shadow.
swap(
  "pieceWrap: { position: 'absolute', minHeight: 116, padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 8, shadowColor: '#000', shadowOpacity: .32, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 }",
  "pieceWrap: { position: 'absolute', minHeight: 116, padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 8, backgroundColor: colors.surfaceRaised }",
);

// The drag hint and the kind label were letter-spaced caps.
swap(
  "pieceDragHint: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, letterSpacing: .5 }",
  "pieceDragHint: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11 }",
);
swap(
  "pieceKind: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '700', letterSpacing: .8 }",
  "pieceKind: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '700' }",
);
swap(
  '<Text style={s.pieceKind}>{piece.kind.toUpperCase()}</Text>',
  '<Text style={s.pieceKind}>{piece.kind}</Text>',
);
swap(
  '<Text style={s.pieceDragHint}>DRAG TO PLACE</Text>',
  '<Text style={s.pieceDragHint}>Drag to place</Text>',
);

// The canvas heading was a caps label too.
swap(
  '<View style={s.canvasTop}><View><Text style={s.canvasLabel}>WORKING CANVAS</Text><Text style={s.canvasTitle}>Reference board</Text></View>',
  '<View style={s.canvasTop}><View><Text style={s.canvasTitle}>Reference board</Text></View>',
);
swap(
  '<View style={s.agentHead}><View><Text style={s.canvasLabel}>AGENT SIDEBAR</Text><Text style={s.canvasTitle}>Design brief</Text></View>',
  '<View style={s.agentHead}><View><Text style={s.canvasTitle}>Design brief</Text></View>',
);
swap(
  '<View style={s.previewHeader}><View><Text style={s.canvasLabel}>LIVE OUTPUT</Text><Text style={s.previewTitle}>Latest finished design</Text></View>',
  '<View style={s.previewHeader}><View><Text style={s.previewTitle}>Latest finished design</Text></View>',
);
swap(
  '<Text style={s.latestTagText}>{latestImage ? \'LATEST\' : \'AUTO\'}</Text>',
  '<Text style={s.latestTagText}>{latestImage ? \'Latest\' : \'Automatic\'}</Text>',
);

// The unused styles go with them.
swap(" gridOverlay: { ...StyleSheet.absoluteFillObject, opacity: .23, backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.support }, stageAxisX: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, backgroundColor: colors.line, opacity: .23 }, stageAxisY: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, backgroundColor: colors.line, opacity: .23 }, stageCorner: { position: 'absolute', right: 10, bottom: 9 }, stageCornerText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, letterSpacing: 1 },", "");
swap(" sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, marginBottom: 11 }, sectionNumber: { width: 22, height: 22, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.support }, sectionNumberText: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '700' },", " sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, marginBottom: 11 },");
swap(" kicker: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },", "");
swap(" livePill: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.support, borderRadius: 20, paddingHorizontal: 12 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.text }, liveText: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '600' },", "");
swap(" canvasLabel: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, fontWeight: '700', letterSpacing: 1.1 },", "");

fs.writeFileSync(file, text, 'utf8');
console.log('design studio updated');
