// Finish the conversion the screen subagent was in the middle of: the two hand rolled
// toggles are gone, so the call sites use the shared Toggle, the inspector note has a
// style, and the theme import still has what the stylesheet uses.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 80)); return; }
  text = text.replace(from, to);
};

// The theme import lost typography, which the stylesheet still uses for the display face.
swap(
  "import { colors, radius, space, type } from './src/theme';",
  "import { colors, radius, space, type, typography } from './src/theme';",
);

// The review policy toggles on the settings screen.
swap(
  '<ReviewToggle label="Code proposals" detail="An independent model reviews generated code. With it off, proposals stay staged for you." value={reviewCode} onChange={setReviewCode} />',
  '<Toggle label="Code proposals" detail="An independent model reviews generated code. With it off, proposals stay staged for you." value={reviewCode} onChange={setReviewCode} />',
);
swap(
  '<ReviewToggle label="Automatic image review" detail="The configured model inspects generated image pixels. Uncertain results are held for you." value={reviewImages} onChange={setReviewImages} />',
  '<Toggle label="Automatic image review" detail="The configured model inspects generated image pixels. Uncertain results are held for you." value={reviewImages} onChange={setReviewImages} />',
);
swap(
  '<ReviewToggle label="Senior agent auto-approval" detail="Let a qualified higher-ranked reviewer apply passed code changes; otherwise you apply them" value={peerApprovalEnabled} onChange={setPeerApprovalEnabled} />',
  '<Toggle label="Senior agent auto-approval" detail="Let a qualified higher-ranked reviewer apply passed code changes; otherwise you apply them" value={peerApprovalEnabled} onChange={setPeerApprovalEnabled} />',
);
swap(
  '<ReviewToggle label="Debate the plan" detail="Up to three specialists critique the planner’s first draft before it is shown to you" value={planningDebate} onChange={setPlanningDebate} />',
  '<Toggle label="Debate the plan" detail="Up to three specialists critique the planner’s first draft before it is shown to you" value={planningDebate} onChange={setPlanningDebate} />',
);

// The agent tool permission toggle, inside the agent card.
swap(
  '<AgentToolToggle label={permissions.read ? \'Read allowed\' : \'Read blocked\'} detail="Open files" value={permissions.read} onChange={value => setAgentPermission(role.id, \'read\', value)} />',
  '<Toggle label="Read" detail="Open files" value={permissions.read} onChange={value => setAgentPermission(role.id, \'read\', value)} />',
);

// The inspector note, which lost its style with the old privacy note.
swap(
  'inspectorSpacer: { flex: 1 }',
  'inspectorSpacer: { flex: 1 }, inspectorNote: { flexDirection: \'row\', alignItems: \'flex-start\', gap: 8, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.line }',
);

fs.writeFileSync(file, text, 'utf8');
console.log('conversion finished');
