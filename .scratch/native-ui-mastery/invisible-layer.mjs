// Two lines of the plan's invisible layer that are visible once they exist:
//
// - A run row says how long ago it was, and the exact time arrives on hover.
// - A toast that reports a change to the user's own project offers the undo in the toast.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => fs.writeFileSync(file, text, 'utf8');
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 80)); return; }
  write(file, text.replace(from, to));
};

// ---- the run rows: relative time, exact time on hover -----------------------------------
swap('src/RunWorkspace.tsx',
  "import { EmptyState, Button, Chip, Section, Figure } from './ui';",
  "import { EmptyState, Button, Chip, Section, Figure } from './ui';\nimport { relativeTime } from './relativeTime';");

swap('src/RunWorkspace.tsx',
  '  const [direction, setDirection] = useState(\'\');',
  "  const [direction, setDirection] = useState('');\n  const [hoveredRun, setHoveredRun] = useState<string | null>(null);");

swap('src/RunWorkspace.tsx',
  `        onPress={() => onOpenRun(item)}
        style={({ pressed }) => [styles.runListItem, pressed && styles.pressed]}
      >
        <Text numberOfLines={1} style={styles.itemTitle}>{item.mission?.name ?? item.brief}</Text>
        <Text style={styles.dim}>{new Date(item.updatedAt).toLocaleString()}</Text>`,
  `        onPress={() => onOpenRun(item)}
        onHoverIn={() => setHoveredRun(item.id)}
        onHoverOut={() => setHoveredRun(current => current === item.id ? null : current)}
        style={({ pressed }) => [styles.runListItem, pressed && styles.pressed]}
      >
        <Text numberOfLines={1} style={styles.itemTitle}>{item.mission?.name ?? item.brief}</Text>
        <Text style={styles.dim} accessibilityLabel={\`Updated \${new Date(item.updatedAt).toLocaleString()}\`}>{hoveredRun === item.id ? new Date(item.updatedAt).toLocaleString() : relativeTime(item.updatedAt)}</Text>`);

swap('App.tsx',
  "import { Reveal, FocusPressable } from './src/Reveal';",
  "import { Reveal, FocusPressable } from './src/Reveal';\nimport { relativeTime } from './src/relativeTime';");

swap('App.tsx',
  '<Text style={styles.savedTeamName}>{new Date(run.createdAt).toLocaleString()}</Text><Text style={styles.savedTeamMeta}>{completed} of {run.items.length} work items complete',
  '<Text style={styles.savedTeamName} accessibilityLabel={`Started ${new Date(run.createdAt).toLocaleString()}`}>{relativeTime(run.createdAt)}</Text><Text style={styles.savedTeamMeta}>{completed} of {run.items.length} work items complete');

swap('App.tsx',
  '<Text style={styles.artifactRunMeta}>{new Date(run.createdAt).toLocaleString()} · {run.brief}</Text>',
  '<Text style={styles.artifactRunMeta}>{relativeTime(run.createdAt)} · {run.brief}</Text>');

// ---- the toast carries the undo ----------------------------------------------------------
// A change to the user's own project is worth a second thought, so the notice that reports
// it also offers the way back.
swap('App.tsx',
  "  const [notice, setNotice] = useState('');",
  `  const [notice, setNoticeText] = useState('');
  const [noticeUndo, setNoticeUndo] = useState<(() => void) | null>(null);
  // Every notice replaces the one before it, so an undo never outlives the action it undoes.
  const setNotice = (text: string) => { setNoticeText(text); setNoticeUndo(null); };`);

swap('App.tsx',
  "      setNotice(`Applied ${change.path} to the selected project.`);",
  `      setNoticeText(\`Applied \${change.path} to the selected project.\`);
      setNoticeUndo(() => () => { void undoCodeChange(changeId, updated); });`);

swap('App.tsx',
  '<ToastSlot>{notice ? <Toast title={notice} onDismiss={() => setNotice(\'\')} /> : null}</ToastSlot>',
  `<ToastSlot>{notice ? <Toast title={notice} action={noticeUndo ? <Button label="Undo" onPress={() => { const undo = noticeUndo; setNoticeUndo(null); setNoticeText(''); undo?.(); }} variant="secondary" /> : undefined} onDismiss={() => setNotice('')} /> : null}</ToastSlot>`);

console.log('invisible layer: relative time and the toast undo');
