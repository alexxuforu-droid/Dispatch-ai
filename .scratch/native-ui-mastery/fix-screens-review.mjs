// What the screens review found, fixed at the source.
//
// The real defects:
// - The studio's vertical drag was scaled by a hard coded 430 while the stage measures its
//   own height, so dragging moved the wrong distance on any other size.
// - Three of the eight prompt recipes were unreachable because the list was cut to five.
// - The reference image the person is annotating was drawn at ninety per cent, which changes
//   what they are judging.
// - Added lines in a diff were the same colour as the context, so only the removals had a
//   signal.
// - The waiting decision row was filled with the lead colour and then held two dark buttons
//   and a dark sentence inside it. The accent belongs on the action, not on the strip.
//
// The unnecessary things:
// - The three starter chips only filled in the composer the person was already looking at.
// - The studio's "What agents receive" card restated the form above it.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 90)); return; }
  write(file, text.replace(from, to));
};

// ---- the studio's drag uses the height the stage measured --------------------------------
swap('src/DesignStudio.tsx',
  "y: Math.max(0, Math.min(64, piece.y + dy / 430 * 100))",
  "y: Math.max(0, Math.min(64, piece.y + dy / Math.max(canvasSize.height, 1) * 100))");

// ---- every recipe is reachable ------------------------------------------------------------
swap('src/DesignStudio.tsx',
  "filteredRecipes.slice(0, 5).map(recipe =>",
  "filteredRecipes.map(recipe =>");

// ---- the reference image is not faded ---------------------------------------------------------
swap('src/DesignStudio.tsx',
  "referenceImage:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%',opacity:.9}",
  "referenceImage:{...StyleSheet.absoluteFillObject,width:'100%',height:'100%'}");

// ---- the diff says which lines were added -----------------------------------------------------
swap('src/RunWorkspace.tsx',
  "  diffAdded: { color: colors.text },",
  "  diffAdded: { color: colors.lead },");

// ---- the accent is on the action, not on the strip ---------------------------------------------
swap('src/RunWorkspace.tsx',
  "  decisionRowWaiting: { backgroundColor: colors.lead },\n  decisionText: { ...type.bodySmall, color: colors.page, fontWeight: '600', marginRight: 'auto' },",
  "  decisionRowWaiting: { borderColor: colors.lead },\n  decisionText: { ...type.bodySmall, color: colors.text, fontWeight: '600', marginRight: 'auto' },");

swap('src/RunWorkspace.tsx',
  "onPress={() => onUndo(activeRun, change.id)} variant={waitingOnYou ? 'inverse' : 'secondary'} />}",
  "onPress={() => onUndo(activeRun, change.id)} variant={waitingOnYou ? 'primary' : 'secondary'} />}");

swap('src/RunWorkspace.tsx',
  "onPress={() => onApply(activeRun, change.id)} variant={waitingOnYou ? 'inverse' : 'primary'} />}",
  "onPress={() => onApply(activeRun, change.id)} variant=\"primary\" />}");

swap('src/RunWorkspace.tsx',
  '{canReject ? <Button label="Reject" onPress={() => onReject(activeRun, change.id)} variant="inverse" /> : null}',
  '{canReject ? <Button label="Reject" onPress={() => onReject(activeRun, change.id)} variant="ghost" /> : null}');

// ---- the starter chips go: they only filled in the composer in front of them --------------------
swap('App.tsx',
  `      <View style={styles.promptSection}><Text style={styles.promptHeading}>Start with a real task</Text><View style={styles.promptRows}>
        <Prompt onPress={() => setDraft('Build a clear implementation plan for my next project.')}>Plan a project</Prompt>
        <Prompt onPress={() => setDraft('Review this code change for correctness, edge cases, and regressions.')}>Review code</Prompt>
        <Prompt onPress={() => setDraft('Create an image concept, then critique the composition and details.')}>Create and review an image</Prompt>
      </View></View></> : <RunConversation`,
  `      </> : <RunConversation`);

// ---- the studio's summary of the brief goes: the form above it already says it -------------------
swap('src/DesignStudio.tsx',
  '<View style={s.payloadCard}><View style={s.payloadHead}><Text style={s.payloadTitle}>What agents receive</Text><Text style={s.payloadCount}>{pieces.length} canvas items</Text></View><Text style={s.payloadLine}>✓ Exact keep / change instructions</Text><Text style={s.payloadLine}>✓ Item positions and prompt text</Text><Text style={s.payloadLine}>✓ {skills.length} selected design skills</Text><Text style={s.payloadLine}>✓ {output} output · {roles.length} active agents</Text></View>',
  '');

console.log('the screens review findings are fixed');
