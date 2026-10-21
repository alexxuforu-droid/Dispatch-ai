// Append the judge wave record to the plan of record, so the plan says what the judges
// changed and not only what the debate changed.
import fs from 'node:fs';

const file = '.scratch/native-ui-mastery/DESIGN-PLAN.md';
const text = fs.readFileSync(file, 'utf8');

const marker = '## 0.3 Sign off checklist';
if (!text.includes(marker)) { console.log('MISS marker'); process.exit(1); }

const section = `## 0.4 Amendment log (after the judge wave)

The judge wave is part of the method, not a report card bolted on at the end. Each round's
findings changed the work, and the change is recorded here the same way the debate's are.

| Round | Judge | What it found | What changed because of it |
|---|---|---|---|
| 1 | code | Six load-bearing defects: an invisible toast, a primary button that turned black on hover, a selected preset that filled with a string, a backdrop hex outside the token file, a ghost button on the lead block at 1.7:1, and a focus ring that vanished on a white button and on the lead block | All six fixed at the source in \`a06d010\`. The two guardrails that let them through were widened to 3, 4, 6 and 8 digit hex values, a rule against a colour written as a string was added to both the checker and the test, and the contrast pairs the interface actually uses are now held by a test. |
| 1 | test | Three flows nothing in the suite ever pressed: start a run, undo an applied change, open a run from the history. No test at all for the persistence layer | All three are pressed now (\`__tests__/App.render.test.tsx\`), the persistence layer has a test (\`__tests__/workspaceProject.test.ts\`), and a rail destination is pressed too, so a dead navigation item fails a test. |
| 1 | visual | The slot returned an internal error four times on the screenshot brief | The wave was re-run on other slots and the captures were taken again; no finding from that round is claimed. |
| 2 | code and test | See the ship report | |

Two rules the code judge's round made permanent, because both are things a person cannot
check by eye:

- A colour is either the token or it is a bug. A token name in quotes renders as no colour
  at all, and the app looked fine in a test.
- The contrast floors that matter are the ones on the surfaces the app actually uses. The
  toast title on the raised surface and the focus ring on a white button were both below
  1.4:1 and neither had a test.

---

`;

fs.writeFileSync(file, text.replace(marker, section + marker), 'utf8');
console.log('plan amended with the judge wave');
