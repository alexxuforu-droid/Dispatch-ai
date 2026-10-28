import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

import { CodeChange, Run, WorkItem } from '../src/orchestration/types';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

const fs = require('fs');
const path = require('path');
const snapshotDir = path.join(process.env.LOCALAPPDATA ?? 'C:\\Users\\Admin\\AppData\\Local', 'Temp', 'opencode', 'snapshots');

jest.setTimeout(60000);

const { ResultsStudio, RunRoom, RunsInbox } = require('../src/RunWorkspace');

type TreeNode = { type: string; props: Record<string, unknown>; children?: (string | TreeNode)[] | string | null };
type TreeRoot = TreeNode | string | null | TreeNode[];

// ---------------------------------------------------------------------------
// Tree walking
//
// ResultsStudio renders every action as a Pressable carrying no accessibilityLabel, so a
// control's accessible name is its own wording -- the same source a reader of the screen has.
// That makes "find the control whose subtree says X" and "is that control enabled" the whole
// contract surface, and both are read off the host node the way assistive tech reads them.
// ---------------------------------------------------------------------------

function subtreeText(node: TreeRoot): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(subtreeText).join(' ');
  const kids = node.children;
  const own = typeof kids === 'string' ? kids : Array.isArray(kids) ? kids.filter((kid): kid is string => typeof kid === 'string').join('') : '';
  const nested = Array.isArray(kids) ? kids.filter((kid): kid is TreeNode => typeof kid === 'object' && kid !== null).map(subtreeText).join(' ') : '';
  return [own, nested].filter(Boolean).join(' ');
}

function pressableNodes(node: TreeRoot): TreeNode[] {
  if (!node || typeof node === 'string') return [];
  if (Array.isArray(node)) return node.flatMap(pressableNodes);
  const handler = node.props?.onClick ?? node.props?.onPress ?? node.props?.onResponderRelease;
  const own = typeof handler === 'function' ? [node] : [];
  return [...own, ...pressableNodes((node.children ?? null) as TreeRoot)];
}

// A control that exists but is disabled is not an affordance. An accessibilityState with no
// disabled key is not evidence of enablement, so the control's own handler is the tiebreaker:
// a node with no press handler can never be pressed by a user, whatever its state claims.
function controlEnabled(control: TreeNode): boolean {
  const handler = control.props.onClick ?? control.props.onPress ?? control.props.onResponderRelease;
  if (typeof handler !== 'function') return false;
  const state = control.props.accessibilityState as { disabled?: boolean } | undefined;
  return state?.disabled !== true;
}

function controlsMatching(node: TreeRoot, pattern: RegExp): TreeNode[] {
  return pressableNodes(node).filter(control => pattern.test(subtreeText(control)));
}

function enabledControlsMatching(node: TreeRoot, pattern: RegExp): TreeNode[] {
  return controlsMatching(node, pattern).filter(controlEnabled);
}

async function pressControl(control: TreeNode): Promise<void> {
  const handler = control.props.onClick ?? control.props.onPress ?? control.props.onResponderRelease;
  if (typeof handler !== 'function') throw new Error('the control exposes no press handler');
  await act(async () => { handler(); });
}

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(element);
  });
  return tree;
}

async function unmount(tree: ReactTestRenderer): Promise<void> {
  await act(async () => {
    tree.unmount();
  });
}

// A diff row carries its marker and its line as sibling children, so the row only reads as the
// single string a user sees when a row's own text children are concatenated first.
function rowText(tree: TreeRoot): string[] {
  if (!tree) return [];
  if (typeof tree === 'string') return [tree];
  if (Array.isArray(tree)) return tree.flatMap(rowText);
  const kids = tree.children;
  const own = typeof kids === 'string' ? [kids] : Array.isArray(kids) ? [kids.filter((kid): kid is string => typeof kid === 'string').join('')] : [];
  const nested = Array.isArray(kids) ? kids.filter((kid): kid is TreeNode => typeof kid === 'object' && kid !== null).flatMap(rowText) : [];
  return [...own, ...nested];
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RESULTS_CHANGE_PATH = 'src/app/greeting.ts';
const BLOCKED_CHANGE_PATH = 'src/app/config.ts';
const LONG_CHANGE_PATH = 'src/app/long.ts';

const RESULTS_BEFORE = 'const Greeter = () => {\nconst message = "hello";\nreturn message;\n};';
const RESULTS_AFTER = 'const Greeter = () => {\nconst message = "hello there";\nreturn message;\n};';

const TRUNCATED_BEFORE = Array.from({ length: 30 }, (_, index) => `old line ${index}`).join('\n');
const TRUNCATED_AFTER = TRUNCATED_BEFORE.replace('old line 15', 'CHANGED LINE');

// A run the way a finished team leaves it behind: one code work item at the status under test,
// one proposed change from that item. Both fates a code proposal can carry live in the changes
// array, so the fixtures carry no secret or cancellation vocabulary of their own and every
// word of these tests has to come from the component.
function resultsRun(itemStatus: WorkItem['status'], change: CodeChange): Run {
  const at = '2026-10-19T08:00:00.000Z';
  return {
    id: 'run-results-contract',
    brief: 'Wire the reviewed change into the results studio.',
    status: 'completed',
    teamId: 'team-default',
    items: [{ id: change.itemId, title: change.path, kind: 'code', agentId: 'builder', dependsOn: [], status: itemStatus, artifactIds: [] }],
    messages: [],
    artifacts: [],
    changes: [change],
    createdAt: at,
    updatedAt: at,
  };
}

function resultsChange(overrides: Partial<CodeChange> = {}): CodeChange {
  return {
    id: 'change-greeting',
    itemId: 'item-greeting',
    path: RESULTS_CHANGE_PATH,
    before: RESULTS_BEFORE,
    after: RESULTS_AFTER,
    createOnly: false,
    createdBy: 'builder',
    attempt: 1,
    ...overrides,
  };
}

type ResultsStudioProps = {
  run: Run | null;
  history: Run[];
  projectRoot?: string | null;
  applyingChanges?: string[];
  onApply: (run: Run, changeId: string) => void | Promise<void>;
  onReject: (run: Run, changeId: string) => void;
  onAcceptArtifact: (run: Run, artifactId: string) => void;
  onSaveRecipe: (run: Run) => void;
  onUndo: (run: Run, changeId: string) => void | Promise<void>;
  onOpenRun: (run: Run) => void;
  // The status/error line for a failed apply or undo. Its wording is the component's to choose, so
  // this contract asserts the message reaches the reviewer, never that a particular label does.
  notice?: string;
  // The dismiss action for that line. A notice the reviewer cannot clear stays on the screen.
  onDismissNotice?: () => void;
};

async function mountResultsStudio(props: Partial<ResultsStudioProps>): Promise<{ tree: ReactTestRenderer; onApply: jest.Mock }> {
  const onApply = jest.fn();
  const tree = await mount(React.createElement(ResultsStudio as React.ComponentType<ResultsStudioProps>, {
    run: null,
    history: [],
    onApply,
    onReject: jest.fn(),
    onAcceptArtifact: jest.fn(),
    onSaveRecipe: jest.fn(),
    onUndo: jest.fn(),
    onOpenRun: jest.fn(),
    ...props,
  }));
  return { tree, onApply };
}

// A truncated proposal is the only one that needs a disclosure: a small diff already shows
// every row it changed, so the "full contents" control on it would be decoration.
function truncatedProposal(): CodeChange {
  return resultsChange({
    id: 'change-long',
    itemId: 'item-long',
    path: LONG_CHANGE_PATH,
    before: TRUNCATED_BEFORE,
    after: TRUNCATED_AFTER,
  });
}

// ---------------------------------------------------------------------------
// Disclosure of the complete contents
// ---------------------------------------------------------------------------

// The card truncates a long proposal to the rows around the edit, but the contract requires the
// complete file to stay reachable through one explicit action. The control's wording is not
// dictated, so it is found by what it offers rather than by a literal, which lets an honest
// relabelling pass while a card that only applies or rejects does not.
function disclosureControlIn(node: TreeRoot): TreeNode | null {
  const applyOrReject = /apply|reject|choose a project folder|blocked for secrets/i;
  return pressableNodes(node).find(control => {
    const words = subtreeText(control);
    if (applyOrReject.test(words)) return false;
    return /complete|full|entire|everything|whole|all|contents/i.test(words);
  }) ?? null;
}

test('a truncated proposal keeps its complete before and after contents one action away', async () => {
  const run = resultsRun('done', truncatedProposal());
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project' });

  const capped = rowText(tree.toJSON()).join('\n');
  // The capped view shows the edit and nothing else: a 30-line file is not dumped on the card.
  expect(capped).toContain('- old line 15');
  expect(capped).toContain('+ CHANGED LINE');
  expect(capped).not.toContain('old line 0');
  expect(capped).not.toContain('old line 29');
  fs.mkdirSync(snapshotDir, { recursive: true });
  fs.writeFileSync(path.join(snapshotDir, 'screen-results-diff.json'), JSON.stringify(tree.toJSON(), null, 1), 'utf8');

  const disclosure = disclosureControlIn(tree.toJSON());
  if (!disclosure) throw new Error('no explicit control offers the complete file contents');
  await pressControl(disclosure);

  // Both sides of the proposal in full, so the cap no longer decides what a reviewer can read.
  const opened = rowText(tree.toJSON()).join('\n');
  expect(opened).toContain(TRUNCATED_BEFORE);
  expect(opened).toContain(TRUNCATED_AFTER);
  fs.writeFileSync(path.join(snapshotDir, 'screen-results-full-content.json'), JSON.stringify(tree.toJSON(), null, 1), 'utf8');

  // The disclosure adds to the change view instead of replacing it, so which rows this
  // proposal moved is still legible beside the complete contents.
  const openedRows = rowText(tree.toJSON());
  expect(openedRows).toContain('- old line 15');
  expect(openedRows).toContain('+ CHANGED LINE');

  // A disclosure that only opens is a state the user cannot leave, so the same control closes.
  const again = disclosureControlIn(tree.toJSON());
  if (!again) throw new Error('the disclosure vanished instead of toggling');
  await pressControl(again);
  expect(rowText(tree.toJSON()).join('\n')).not.toContain('old line 0');
  await unmount(tree);
}, 60000);

// ---------------------------------------------------------------------------
// Secret-blocked and cancelled proposals
// ---------------------------------------------------------------------------

test('a secret-blocked proposal states the refusal reason and offers no enabled apply', async () => {
  const run = resultsRun('needs-approval', resultsChange({
    id: 'change-flagged',
    itemId: 'item-flagged',
    path: BLOCKED_CHANGE_PATH,
    before: '',
    after: 'const api_key = "sk-live-abcdef123456";\ncall(api_key);',
    createOnly: true,
  }));
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project' });
  const rendered = subtreeText(tree.toJSON());

  expect(rendered).toContain(BLOCKED_CHANGE_PATH);
  // The refusal the apply would produce is the card's own reason, so a reviewer reads why the
  // file cannot be written instead of pressing a control that silently does nothing.
  expect(rendered).toContain(`Refused to apply ${BLOCKED_CHANGE_PATH}:1`);
  expect(rendered).toMatch(/hardcoded/i);
  // And while the proposal is flagged, nothing on the card offers an enabled apply. The scan
  // is a hard gate: there is no override, so an enabled control here is a lie about the state.
  expect(enabledControlsMatching(tree.toJSON(), /apply/i)).toEqual([]);

  // A blocked card still answers "why" on demand, so the disclosure has to exist somewhere --
  // its own label or the reason printed on the card. The control must say what it discloses,
  // like "View block reason", not something that reads as an override.
  const controls = controlsMatching(tree.toJSON(), /why|block|reason|secret/i);
  expect(controls.length).toBeGreaterThan(0);
  for (const control of controls) {
    expect(controlEnabled(control)).toBe(false);
    expect(subtreeText(control)).not.toMatch(/apply anyway|override/i);
  }
  await unmount(tree);
}, 60000);

test('a cancelled proposal says it was cancelled and is never described as waiting for review', async () => {
  const run = resultsRun('cancelled', resultsChange({ id: 'change-cancelled', itemId: 'item-cancelled' }));
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project' });

  const cancelledAction = controlsMatching(tree.toJSON(), /cancel/i);
  if (!cancelledAction.length) throw new Error('no action is labelled as cancelled');
  for (const control of cancelledAction) {
    expect(controlEnabled(control)).toBe(false);
  }
  // The fate gets its own sentence rather than the review status of work that was never
  // waiting for review.
  expect(cancelledAction.some(control => subtreeText(control).includes('Run was cancelled'))).toBe(true);
  // The receipt already prints the item's recorded status, but the action's label is the part
  // the card is free to rewrite, so its words are checked as text rather than through props.
  expect(subtreeText(tree.toJSON())).not.toMatch(/waiting for review/i);
  await unmount(tree);
}, 60000);

// ---------------------------------------------------------------------------
// Failed apply / undo notice on the results surface
// ---------------------------------------------------------------------------

// Writing a reviewed change to disk is the one action on this surface that can fail after the
// press, and the native bridge rejects such a write with its own reason -- DispatchWorkspace.cpp:193,
// "The project file changed since the proposal was reviewed...". The App lifts that reason into the
// notice it hands ResultsStudio, so a reviewer who just pressed apply or undo and had it fail must
// still read why on this screen rather than meeting a silent no-op.
const FAILED_APPLY_NOTICE = 'The project file changed since the proposal was reviewed. Refresh its context and ask the agents to revise it.';

test('a failed apply or undo notice renders as a status notice the reviewer can read', async () => {
  // An applied change is the state an undo acts on, and that undo has just failed -- so the notice
  // about it sits on the same screen that offers "Undo applied change".
  const run = resultsRun('done', resultsChange({ appliedAt: '2026-10-19T08:05:00.000Z' }));
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project', notice: FAILED_APPLY_NOTICE });

  // Visibly rendered: the failure reads as words on the screen, not a vanished prop.
  expect(subtreeText(tree.toJSON())).toContain(FAILED_APPLY_NOTICE);
  // Accessible to the tree: the reason reached a rendered node rather than being dropped as an
  // unused prop, so it stays part of the component tree the renderer exposes.
  expect(JSON.stringify(tree.toJSON())).toContain(FAILED_APPLY_NOTICE);
  await unmount(tree);
}, 60000);

// A notice the reviewer cannot clear stays on the screen for the rest of the session, so the
// surface that reports a failed write has to offer a way to dismiss it.
test('the results notice can be dismissed', async () => {
  const run = resultsRun('done', resultsChange({ appliedAt: '2026-10-19T08:05:00.000Z' }));
  const onDismissNotice = jest.fn();
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project', notice: FAILED_APPLY_NOTICE, onDismissNotice });

  const dismiss = controlsMatching(tree.toJSON(), /dismiss notice/i);
  expect(dismiss.length).toBeGreaterThan(0);
  await pressControl(dismiss[0]);
  expect(onDismissNotice).toHaveBeenCalledTimes(1);
  await unmount(tree);
}, 60000);

test('reject stays visible but disabled while the same proposal is applying', async () => {
  const run = resultsRun('done', resultsChange());
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project', applyingChanges: ['change-greeting'] });
  const reject = controlsMatching(tree.toJSON(), /^reject$/i)[0];
  if (!reject) throw new Error('the proposal offers no reject control during apply');
  expect(controlEnabled(reject)).toBe(false);
  expect(subtreeText(tree.toJSON())).toMatch(/applying change/i);
  await unmount(tree);
});

test('the earliest image version is not shown as its own previous version', async () => {
  const { Image } = require('react-native');
  const run = resultsRun('done', resultsChange());
  run.artifacts = [
    { id: 'image-old', runId: run.id, kind: 'image', name: 'earlier.png', uri: 'file:///earlier.png', createdBy: 'builder' },
    { id: 'image-new', runId: run.id, kind: 'image', name: 'latest.png', uri: 'file:///latest.png', createdBy: 'builder' },
  ];
  const { tree } = await mountResultsStudio({ run });

  const imageComparison = tree.root.findByProps({ testID: 'image-comparison' });
  expect(imageComparison.findAll(node => node.type === Image)).toHaveLength(2);
  const earlier = controlsMatching(tree.toJSON(), /earlier\.png · version 1/i)[0];
  if (!earlier) throw new Error('the earliest image version cannot be selected');
  await pressControl(earlier);

  expect(imageComparison.findAll(node => node.type === Image)).toHaveLength(1);
  await unmount(tree);
});

// ---------------------------------------------------------------------------
// Keyboard focus
// ---------------------------------------------------------------------------

// Windows leaves focus to the app, so a control that only shows a pressed state is invisible
// to keyboard users. The focus ring has to appear on the control itself.
function borderOf(control: TreeNode): { color?: string; width?: number } {
  const flatten = (value: unknown): Record<string, unknown> => {
    if (!value) return {};
    if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten));
    if (typeof value === 'object') return value as Record<string, unknown>;
    return {};
  };
  const flat = flatten(control.props.style);
  return { color: flat.borderColor as string | undefined, width: flat.borderWidth as number | undefined };
}

test('a focused control shows a focus ring and loses it on blur', async () => {
  const run = resultsRun('done', resultsChange());
  const { tree } = await mountResultsStudio({ run, projectRoot: 'Z:\\fixture-project' });

  const apply = controlsMatching(tree.toJSON(), /apply change/i);
  expect(apply.length).toBeGreaterThan(0);
  const control = apply[0];
  const before = borderOf(control);
  const beforeColour = before.color;

  const onFocus = control.props.onFocus as ((event: unknown) => void) | undefined;
  const onBlur = control.props.onBlur as ((event: unknown) => void) | undefined;
  expect(typeof onFocus).toBe('function');
  expect(typeof onBlur).toBe('function');

  await act(async () => { onFocus?.({}); });
  const focused = borderOf(controlsMatching(tree.toJSON(), /apply change/i)[0]);
  // The indicator is a colour change, so the control keeps its size: the border colour
  // differs from the unfocused one, but no border width is added.
  expect(focused.color).not.toBe(beforeColour);
  expect(focused.width).toBe(before.width);

  await act(async () => { onBlur?.({}); });
  const blurred = borderOf(controlsMatching(tree.toJSON(), /apply change/i)[0]);
  expect(blurred.color).toBe(beforeColour);
  await unmount(tree);
}, 60000);

test('a focused borderless lead control gets a high-contrast ink outline', async () => {
  const { FocusPressable } = require('../src/Reveal');
  const { StyleSheet, Text } = require('react-native');
  const { colors } = require('../src/theme');
  const tree = await mount(React.createElement(FocusPressable, {
    accessibilityRole: 'button',
    accessibilityLabel: 'Selected preset',
    style: [{ backgroundColor: colors.surface }, { backgroundColor: colors.lead }],
  }, React.createElement(Text, null, 'Preset')));
  const control = pressableNodes(tree.toJSON()).find(node => node.props.accessibilityLabel === 'Selected preset');
  if (!control) throw new Error('the preset has no button in the accessibility tree');
  const focus = control.props.onFocus as ((event: unknown) => void) | undefined;
  if (!focus) throw new Error('the control cannot receive keyboard focus');
  await act(async () => { focus({}); });
  const ring = tree.root.findAll(node => node.props.testID === 'focus-visible-ring')[0];
  if (!ring) throw new Error('a borderless control has no visible focus outline');
  expect(StyleSheet.flatten(ring.props.style as never)).toMatchObject({ borderColor: colors.leadInk, borderWidth: 2 });
  await unmount(tree);
}, 60000);

// ---------------------------------------------------------------------------
// Entrance motion
// ---------------------------------------------------------------------------

// The reveal animation is a convenience, never a gate on reading the content, and it must
// not leave a hidden element behind when it does not run.
test('revealed content renders settled, with no animated wrapper in the tree', async () => {
  const { Reveal } = require('../src/Reveal');
  const { Text } = require('react-native');
  const tree = await mount(React.createElement(Reveal, { style: { padding: 4 } }, React.createElement(Text, null, 'settled content')));
  const json = JSON.stringify(tree.toJSON());
  expect(json).toContain('settled content');
  // No animation value in the tree: the content is readable the moment it is rendered.
  expect(json).not.toMatch(/Animated|opacity.*0\b/);
  await unmount(tree);
}, 60000);

// ---------------------------------------------------------------------------
// RunRoom Resume
// ---------------------------------------------------------------------------

type RunRoomProps = {
  run: Run | null;
  busy: boolean;
  onPause: () => void;
  // RunsInbox passes the selected row's run. Resume must keep that exact selection instead of
  // falling back to whichever run happens to be current in Dispatch.
  onResume: (run: Run) => void;
  onPlan: (run: Run) => void;
  onResults: (run: Run) => void;
  onUpdate: (run: Run) => void;
};

function roomRun(): Run {
  const at = '2026-10-19T08:00:00.000Z';
  return {
    id: 'run-room-fallback',
    brief: 'Finish the paused build.',
    status: 'cancelled',
    teamId: 'team-default',
    items: [{ id: 'item-1', title: 'Wire the run room', kind: 'code', agentId: 'builder', dependsOn: [], status: 'done', artifactIds: [] }],
    messages: [],
    artifacts: [],
    createdAt: at,
    updatedAt: at,
  };
}

function inboxRun(id: string, brief: string, messages: Run['messages'] = []): Run {
  const at = '2026-10-19T08:00:00.000Z';
  return {
    id,
    brief,
    status: 'running',
    teamId: 'team-default',
    items: [],
    messages,
    artifacts: [],
    createdAt: at,
    updatedAt: at,
  };
}

test('Runs is an inbox with selectable conversations and a messages-only selected thread', async () => {
  const older = inboxRun('run-older', 'Tighten the release notes.', [
    { id: 'message-1', runId: 'run-older', from: 'Planner', to: 'team', text: 'I will start with the release title.', createdAt: '2026-10-19T08:00:00.000Z', kind: 'handoff' },
    { id: 'message-2', runId: 'run-older', from: 'Builder', to: 'Planner', text: 'The heading now fits above the fold.', createdAt: '2026-10-19T08:01:00.000Z', kind: 'update' },
  ]);
  const selected = inboxRun('run-selected', 'Check the setup screen.');
  const onSelectRun = jest.fn();
  const onOpenPlan = jest.fn();
  const onOpenResults = jest.fn();
  const tree = await mount(React.createElement(RunsInbox, {
    runs: [older, selected],
    selectedRun: older,
    busyRunId: null,
    onSelectRun,
    onOpenPlan,
    onOpenResults,
    onPause: jest.fn(),
    onResume: jest.fn(),
    onUpdate: jest.fn(),
  }));

  const rendered = subtreeText(tree.toJSON());
  expect(rendered).toContain('Tighten the release notes.');
  expect(rendered).toContain('Check the setup screen.');
  expect(rendered).not.toContain('Assignments');
  expect(rendered).not.toContain('tasks done');
  const thread = tree.root.findByProps({ testID: 'run-chat-thread' });
  const threadText = subtreeText(thread as unknown as TreeNode);
  expect(threadText.indexOf('I will start with the release title.')).toBeLessThan(threadText.indexOf('The heading now fits above the fold.'));

  const select = controlsMatching(tree.toJSON(), /Check the setup screen/i).find(control => (control.props.accessibilityState as { selected?: boolean } | undefined)?.selected === false);
  if (!select) throw new Error('the other run has no selectable inbox row');
  await pressControl(select);
  expect(onSelectRun).toHaveBeenCalledWith(selected);
  await act(async () => tree.update(React.createElement(RunsInbox, {
    runs: [older, selected],
    selectedRun: selected,
    busyRunId: null,
    onSelectRun,
    onOpenPlan,
    onOpenResults,
    onPause: jest.fn(),
    onResume: jest.fn(),
    onUpdate: jest.fn(),
    onStartRun: jest.fn(),
  })));

  const plan = controlsMatching(tree.toJSON(), /^plan$/i)[0];
  const results = controlsMatching(tree.toJSON(), /^results$/i)[0];
  if (!plan || !results) throw new Error('the selected chat has no separate plan and results routes');
  await pressControl(plan);
  await pressControl(results);
  expect(onOpenPlan).toHaveBeenCalledWith(selected);
  expect(onOpenResults).toHaveBeenCalledWith(selected);
  await unmount(tree);
});

test('Runs inbox empty state offers a route to start the first run', async () => {
  const onStartRun = jest.fn();
  const tree = await mount(React.createElement(RunsInbox, {
    runs: [],
    selectedRun: null,
    busyRunId: null,
    onSelectRun: jest.fn(),
    onOpenPlan: jest.fn(),
    onOpenResults: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onUpdate: jest.fn(),
    onStartRun,
  }));
  expect(subtreeText(tree.toJSON())).toMatch(/no runs yet/i);
  const start = controlsMatching(tree.toJSON(), /start a run/i)[0];
  if (!start) throw new Error('the empty inbox has no start-run action');
  await pressControl(start);
  expect(onStartRun).toHaveBeenCalledTimes(1);
  await unmount(tree);
});

test('a new message offers a jump without replacing the selected run while the reader is above the bottom', async () => {
  const first = { id: 'message-1', runId: 'run-live', from: 'Planner', to: 'team', text: 'First update.', createdAt: '2026-10-19T08:00:00.000Z', kind: 'handoff' as const };
  const second = { id: 'message-2', runId: 'run-live', from: 'Builder', to: 'team', text: 'Second update.', createdAt: '2026-10-19T08:01:00.000Z', kind: 'update' as const };
  const initial = inboxRun('run-live', 'Keep the selected run steady.', [first]);
  const props = {
    runs: [initial],
    selectedRun: initial,
    busyRunId: null,
    onSelectRun: jest.fn(),
    onOpenPlan: jest.fn(),
    onOpenResults: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onUpdate: jest.fn(),
    onStartRun: jest.fn(),
  };
  const tree = await mount(React.createElement(RunsInbox, props));
  const thread = tree.root.findByProps({ testID: 'run-chat-thread' });
  await act(async () => {
    (thread.props.onScroll as (event: unknown) => void)({ nativeEvent: { contentOffset: { y: 0 }, layoutMeasurement: { height: 220 }, contentSize: { height: 900 } } });
  });
  const updated = { ...initial, messages: [first, second] };
  await act(async () => tree.update(React.createElement(RunsInbox, { ...props, runs: [updated], selectedRun: updated })));
  expect(subtreeText(tree.toJSON())).toContain('1 new message · Jump to latest');
  expect(subtreeText(tree.toJSON())).toContain('Keep the selected run steady.');
  await unmount(tree);
});

test('a completed run does not offer to send a message to an inactive team', async () => {
  const { TextInput } = require('react-native');
  const completed = { ...roomRun(), status: 'completed' as const };
  const tree = await mount(React.createElement(RunRoom, {
    run: completed,
    busy: false,
    onPause: jest.fn(),
    onResume: jest.fn(),
    onPlan: jest.fn(),
    onResults: jest.fn(),
    onUpdate: jest.fn(),
  }));
  const inactiveComposer = tree.root.findAll(node => node.type === TextInput && node.props.accessibilityLabel === 'Message the agent team');
  expect(inactiveComposer).toHaveLength(0);
  expect(subtreeText(tree.toJSON())).toContain('This run is complete. Start a new run to message the team.');
  await unmount(tree);
});

test('Resume in the run room passes the run on screen to its callback', async () => {
  const displayed = roomRun();
  const onResume = jest.fn();
  const tree = await mount(React.createElement(RunRoom as React.ComponentType<RunRoomProps>, {
    run: displayed,
    busy: false,
    onPause: jest.fn(),
    onResume: onResume as unknown as () => void,
    onPlan: jest.fn(),
    onResults: jest.fn(),
    onUpdate: jest.fn(),
  }));

  // The resume control is what a user sees on this card, and it only exists because the run on
  // screen is resumable -- a card with no current run is the case this pins.
  const resumeControls = controlsMatching(tree.toJSON(), /resume/i);
  if (!resumeControls.length) throw new Error('no control offers to resume the run');
  for (const control of resumeControls) {
    expect(controlEnabled(control)).toBe(true);
  }
  await pressControl(resumeControls[0]);
  expect(onResume).toHaveBeenCalledTimes(1);
  // The displayed run itself, so a run the App no longer holds as current is still the one that
  // gets resumed rather than silently dropped by a no-argument callback.
  expect(onResume).toHaveBeenCalledWith(displayed);
  await unmount(tree);
}, 60000);
