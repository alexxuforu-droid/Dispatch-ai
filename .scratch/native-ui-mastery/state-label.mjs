// The run state reads as a word, not as an enum value. The same vocabulary is used on the
// run thread and the task board.
import fs from 'node:fs';

const file = 'src/RunWorkspace.tsx';
let text = fs.readFileSync(file, 'utf8');

const from = "  const otherRuns = history.filter(item => item.id !== activeRun.id).slice(0, 6);";
const to = `  const otherRuns = history.filter(item => item.id !== activeRun.id).slice(0, 6);
  const stateLabel: Record<Run['status'], string> = {
    queued: 'Plan ready',
    running: 'In progress',
    reviewing: 'Reviewing',
    completed: 'Complete',
    failed: 'Stopped',
    cancelled: 'Cancelled',
    'needs-approval': 'Needs your review',
  };`;

if (!text.includes(from)) { console.log('MISS anchor'); process.exit(1); }
text = text.replace(from, to);
text = text.replace(
  '<Figure value={activeRun.status} label="state" />',
  '<Figure value={stateLabel[activeRun.status]} label="state" />',
);

fs.writeFileSync(file, text, 'utf8');
console.log('run state label added');
