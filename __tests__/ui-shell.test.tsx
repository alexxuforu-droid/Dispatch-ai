/**
 * The shell of the app: the parts a person uses before and during a run.
 *
 * Four contracts live here, and each of them is a promise the screen makes:
 *
 *   - the composer starts the run on Enter, and leaves it alone on Shift and Enter,
 *     because that is the key that asks for a line break;
 *   - a plan that would wait on itself is refused, and the refusal says why;
 *   - moving a step to another agent hands back a new plan and leaves the old one alone;
 *   - every item in the sidebar, compact or not, has an accessible name and a hint.
 *
 * The conversation is on screen too: the handoffs, the review findings and the tool audit
 * lines are the run's own record, and a run that hides them hides the evidence.
 */
import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';
import { TextInput } from 'react-native';

import { Run, WorkItem } from '../src/orchestration/types';
import { reassignWorkItem, setDependency } from '../src/app/policy/planEditing';
import { DispatchHome } from '../src/app/views/dispatch/DispatchHome';
import { RunConversation } from '../src/app/views/dispatch/RunConversation';
import { Sidebar } from '../src/app/views/shell/Sidebar';

type TreeNode = { type: string; props: Record<string, unknown>; children?: (string | TreeNode)[] | string | null };
type TreeRoot = TreeNode | string | null | TreeNode[];

function subtreeText(node: TreeRoot): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(subtreeText).join(' ');
  const kids = node.children;
  const own = typeof kids === 'string' ? kids : Array.isArray(kids) ? kids.filter((kid): kid is string => typeof kid === 'string').join('') : '';
  const nested = Array.isArray(kids) ? kids.filter((kid): kid is TreeNode => typeof kid === 'object' && kid !== null).map(subtreeText).join(' ') : '';
  return [own, nested].filter(Boolean).join(' ');
}

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(element); });
  return tree;
}

async function unmount(tree: ReactTestRenderer): Promise<void> {
  await act(async () => { tree.unmount(); });
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const planItems: WorkItem[] = [
  { id: 'work-1', title: 'Plan the work', kind: 'plan', agentId: 'planner', dependsOn: [], status: 'ready', artifactIds: [] },
  { id: 'work-2', title: 'Build it', kind: 'code', agentId: 'builder', dependsOn: ['work-1'], status: 'blocked', artifactIds: [] },
];

function runWith(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    brief: 'Ship the thing.',
    status: 'queued',
    teamId: 'team-default',
    items: planItems,
    messages: [],
    artifacts: [],
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    ...overrides,
  };
}

type DispatchHomeProps = React.ComponentProps<typeof DispatchHome>;

function dispatchProps(overrides: Partial<DispatchHomeProps> = {}): DispatchHomeProps {
  return {
    draft: 'Ship the thing.',
    setDraft: jest.fn(),
    onSelectMission: jest.fn(),
    onStart: jest.fn(),
    onApprovePlan: jest.fn(),
    onEditPlanTitle: jest.fn(),
    onOpenResults: jest.fn(),
    onBrowseFiles: jest.fn(),
    canStart: true,
    run: null,
    runBusy: false,
    pendingBrief: '',
    providerReady: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// The plan rules
// ---------------------------------------------------------------------------

test('a dependency that would make the plan wait on itself is refused, with the reason', () => {
  // work-2 already waits for work-1, so work-1 waiting for work-2 closes the loop.
  const result = setDependency(planItems, 'work-1', 'work-2', true);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('the cycle was not refused');
  expect(result.reason).toMatch(/wait on itself/i);
  // The plan that was handed in comes back untouched, so a refused edit changes nothing.
  expect(result.items).toBe(planItems);
});

test('moving a step to another agent hands back a new plan and leaves the old one alone', () => {
  const result = reassignWorkItem(planItems, 'work-2', 'planner', ['planner', 'builder']);

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`the assignment was refused: ${result.reason}`);
  expect(result.items.find(item => item.id === 'work-2')?.agentId).toBe('planner');
  // The plan the policy was given is not edited in place.
  expect(planItems.find(item => item.id === 'work-2')?.agentId).toBe('builder');
});

test('an agent that is not on the team cannot own a step', () => {
  const result = reassignWorkItem(planItems, 'work-2', 'stranger', ['planner', 'builder']);

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('the assignment was not refused');
  expect(result.reason).toMatch(/not on this run's team/i);
});

// ---------------------------------------------------------------------------
// The composer
// ---------------------------------------------------------------------------

test('the composer starts the run when Enter is pressed', async () => {
  const onStart = jest.fn();
  const tree = await mount(<DispatchHome {...dispatchProps({ onStart })} />);

  const input = tree.root.findByType(TextInput);
  await act(async () => { input.props.onKeyDown({ nativeEvent: { key: 'Enter', shiftKey: false } }); });

  expect(onStart).toHaveBeenCalledTimes(1);
  await unmount(tree);
});

test('Shift and Enter in the composer asks for a line break and leaves the run alone', async () => {
  const onStart = jest.fn();
  const tree = await mount(<DispatchHome {...dispatchProps({ onStart })} />);

  const input = tree.root.findByType(TextInput);
  await act(async () => { input.props.onKeyDown({ nativeEvent: { key: 'Enter', shiftKey: true } }); });

  expect(onStart).not.toHaveBeenCalled();
  await unmount(tree);
});

test('the composer says which key starts the run', async () => {
  const tree = await mount(<DispatchHome {...dispatchProps()} />);

  expect(subtreeText(tree.toJSON())).toContain('Enter to run, Shift + Enter for a line break');
  await unmount(tree);
});

// ---------------------------------------------------------------------------
// The sidebar
// ---------------------------------------------------------------------------

test('every item in the compact sidebar has an accessible name and a hint', async () => {
  const tree = await mount(<Sidebar screen="dispatch" setScreen={jest.fn()} compact onNew={jest.fn()} />);

  const buttons = tree.root.findAll(node => node.props.accessibilityRole === 'button');
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) {
    expect(typeof button.props.accessibilityLabel).toBe('string');
    expect(String(button.props.accessibilityLabel).length).toBeGreaterThan(0);
    expect(typeof button.props.accessibilityHint).toBe('string');
    expect(String(button.props.accessibilityHint).length).toBeGreaterThan(0);
  }
  await unmount(tree);
});

test('the compact sidebar names every page it offers', async () => {
  const tree = await mount(<Sidebar screen="dispatch" setScreen={jest.fn()} compact onNew={jest.fn()} />);

  const names = tree.root.findAll(node => node.props.accessibilityRole === 'button')
    .map(node => String(node.props.accessibilityLabel ?? ''));
  // The compact rail shows no words, so the label is the only thing that says what it is.
  expect(names).toContain('Dispatch');
  expect(names).toContain('Results');
  expect(names).toContain('Review findings');
  expect(names).toContain('Capabilities');
  await unmount(tree);
});

// ---------------------------------------------------------------------------
// The conversation
// ---------------------------------------------------------------------------

test('the dispatch screen shows the handoffs, the review findings and the tool audit lines', async () => {
  const run = runWith({
    messages: [
      { id: 'msg-1', runId: 'run-1', from: 'Planner', to: 'team', text: 'Handed the build to the builder.', kind: 'handoff', createdAt: '2026-10-20T08:01:00.000Z' },
      { id: 'msg-2', runId: 'run-1', from: 'Code reviewer', to: 'team', text: 'The change misses the error path.', kind: 'finding', createdAt: '2026-10-20T08:02:00.000Z' },
      { id: 'msg-3', runId: 'run-1', from: 'Builder', to: 'team', text: 'Workspace tool audit for Builder:\nread src/app.ts', kind: 'update', createdAt: '2026-10-20T08:03:00.000Z' },
    ],
  });
  const tree = await mount(<RunConversation run={run} pendingBrief="" busy={false} onOpenResults={jest.fn()} onApprovePlan={jest.fn()} onEditPlanTitle={jest.fn()} />);

  const text = subtreeText(tree.toJSON());
  expect(text).toContain('Team conversation');
  expect(text).toContain('Handoff');
  expect(text).toContain('Review finding');
  expect(text).toContain('Tool audit');
  expect(text).toContain('Handed the build to the builder.');
  expect(text).toContain('The change misses the error path.');
  expect(text).toContain('read src/app.ts');
  await unmount(tree);
});

test('the plan editor says why a refused change was refused', async () => {
  const tree = await mount(<RunConversation run={runWith()} pendingBrief="" busy={false} onOpenResults={jest.fn()} onApprovePlan={jest.fn()} onEditPlanTitle={jest.fn()} />);

  const open = tree.root.findAll(node => node.props.accessibilityLabel === 'Edit plan owners and dependencies')[0];
  await act(async () => { open.props.onPress(); });

  // work-1 cannot wait for work-2, because work-2 already waits for work-1.
  const add = tree.root.findAll(node => node.props.accessibilityLabel === 'Add the dependency on step 2, Build it')[0];
  await act(async () => { add.props.onPress(); });

  const alerts = tree.root.findAll(node => node.props.accessibilityRole === 'alert');
  expect(alerts.length).toBeGreaterThan(0);
  expect(subtreeText(alerts[0] as unknown as TreeRoot)).toMatch(/wait on itself/i);
  await unmount(tree);
});

test('moving a step to another agent reports the edited plan upward', async () => {
  const onEditPlanItems = jest.fn();
  const tree = await mount(<RunConversation run={runWith()} pendingBrief="" busy={false} onOpenResults={jest.fn()} onApprovePlan={jest.fn()} onEditPlanTitle={jest.fn()} onEditPlanItems={onEditPlanItems} />);

  const open = tree.root.findAll(node => node.props.accessibilityLabel === 'Edit plan owners and dependencies')[0];
  await act(async () => { open.props.onPress(); });

  const move = tree.root.findAll(node => node.props.accessibilityLabel === 'Give step 2, Build it, to Planner')[0];
  await act(async () => { move.props.onPress(); });

  expect(onEditPlanItems).toHaveBeenCalledTimes(1);
  const edited = onEditPlanItems.mock.calls[0][0] as WorkItem[];
  expect(edited.find(item => item.id === 'work-2')?.agentId).toBe('planner');
  await unmount(tree);
});
