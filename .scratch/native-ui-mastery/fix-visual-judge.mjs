// The visual judge's findings, fixed at the source.
//
// - The page title moves into the top bar at its own size, and the slogan headings go. A
//   page had two headings, one of them a slogan.
// - The uppercase letter-spaced labels go: "YOUR TASK", the board's statuses.
// - "Resume run" is the primary action of the run room, and the apply control is the
//   primary action of the decision row, so the decision row has a decision in it.
// - The task board counts what it shows, including the cancelled work.
// - The provider's refresh button says which list it refreshes.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 80)); return; }
  write(file, text.replace(from, to));
};

// ---- the page title in the top bar --------------------------------------------------------
swap('App.tsx',
  "topbarTitle: { color: colors.text, fontFamily: typography.display, fontSize: 13, fontWeight: '600' }",
  "topbarTitle: { color: colors.text, fontFamily: typography.display, fontSize: 20, fontWeight: '600' }");

// ---- the slogan headings go ----------------------------------------------------------------
for (const heading of [
  '<Text style={styles.collectionHeading}>Capabilities, with clear boundaries.</Text>',
  '<Text style={styles.collectionHeading}>Tasks your team repeats.</Text>',
  '<Text style={styles.collectionHeading}>Assignments across your runs.</Text>',
  '<Text style={styles.collectionHeading}>Every token your agents spend.</Text>',
  '<Text style={styles.collectionHeading}>The teams you can dispatch.</Text>',
  '<Text style={styles.collectionHeading}>Your workspace, your rules.</Text>',
  '<Text style={styles.collectionHeading}>{data.title}</Text>',
]) {
  swap('App.tsx', heading, '');
}

// ---- the uppercase labels ---------------------------------------------------------------------
swap('App.tsx', '<Text style={styles.threadLabel}>YOUR TASK</Text>', '<Text style={styles.threadLabel}>Your task</Text>');
swap('App.tsx',
  "const statusLabel = (status: string) => ({ ready: 'READY', running: 'WORKING', blocked: 'BLOCKED', done: 'DONE', failed: 'FAILED', cancelled: 'CANCELLED', 'needs-approval': 'REVIEW' }[status] ?? status);",
  "const statusLabel = (status: string) => ({ ready: 'Ready', running: 'Working', blocked: 'Blocked', done: 'Done', failed: 'Failed', cancelled: 'Cancelled', 'needs-approval': 'Review' }[status] ?? status);");
swap('App.tsx', "role.kinds.map(kind => kind.toUpperCase()", "role.kinds.map(kind => kind");

// ---- one primary action per screen ------------------------------------------------------------
swap('src/RunWorkspace.tsx',
  '? <Button label="Resume run" onPress={() => onResume(run)} /> : null}',
  '? <Button label="Resume run" onPress={() => onResume(run)} variant="primary" /> : null}');

// The decision row holds the decision, so the decision is the primary control in it.
swap('src/RunWorkspace.tsx',
  "onPress={() => onApply(activeRun, change.id)} variant={waitingOnYou ? 'inverse' : 'secondary'} />}",
  "onPress={() => onApply(activeRun, change.id)} variant={waitingOnYou ? 'inverse' : 'primary'} />}");

// ---- the board counts what it shows ------------------------------------------------------------
swap('App.tsx',
  "<Text style={styles.boardSummaryText}>{items.filter(entry => entry.item.status === 'done').length} done</Text></View>",
  "<Text style={styles.boardSummaryText}>{items.filter(entry => entry.item.status === 'done').length} done</Text><Text style={styles.boardSummaryText}>{items.filter(entry => entry.item.status === 'cancelled').length} cancelled</Text></View>");

// ---- the refresh button says which list ---------------------------------------------------------
swap('App.tsx',
  "{catalogBusy ? 'Refreshing…' : 'Refresh list'}",
  "{catalogBusy ? 'Refreshing…' : 'Refresh model list'}");

console.log('the visual judge findings are fixed');
