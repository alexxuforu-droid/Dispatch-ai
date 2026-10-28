/**
 * The results surface: comparing two runs, exporting from it, and the notices it raises.
 *
 * Three contracts live here, and each of them is a promise the screen makes to the person
 * looking at it:
 *
 *   - two runs can be compared, and a difference in a work item's status is reported as a
 *     difference rather than smoothed over;
 *   - an export that the person cancels says nothing at all, because a cancelled save dialog
 *     is a choice, not a failure;
 *   - a notice that says something went wrong reads differently from one that says something
 *     worked, in words as well as colour.
 */
import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

import { CodeChange, Run, WorkItem } from '../src/orchestration/types';
import type { RunComparison } from '../src/RunWorkspace';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

// The export writes through the native Windows module, which does not exist in a test. The
// mock stands in for the save dialog: null is what a cancelled dialog returns.
jest.mock('../src/exporter', () => ({
  saveChangeAs: jest.fn(async () => null),
  saveReportAs: jest.fn(async () => null),
}));

const { ResultsStudio } = require('../src/RunWorkspace');
const compareRuns = require('../src/RunWorkspace').compareRuns as (left: Run, right: Run) => RunComparison;
const { Toast } = require('../src/ui');
const { saveChangeAs } = require('../src/exporter');

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

function pressableNodes(node: TreeRoot): TreeNode[] {
  if (!node || typeof node === 'string') return [];
  if (Array.isArray(node)) return node.flatMap(pressableNodes);
  const handler = node.props?.onClick ?? node.props?.onPress ?? node.props?.onResponderRelease;
  const own = typeof handler === 'function' ? [node] : [];
  return [...own, ...pressableNodes((node.children ?? null) as TreeRoot)];
}

function controlsMatching(node: TreeRoot, pattern: RegExp): TreeNode[] {
  return pressableNodes(node).filter(control => pattern.test(subtreeText(control)));
}

async function pressControl(control: TreeNode): Promise<void> {
  const handler = control.props.onClick ?? control.props.onPress ?? control.props.onResponderRelease;
  if (typeof handler !== 'function') throw new Error('the control exposes no press handler');
  await act(async () => { handler(); });
  // The export path is asynchronous, so the promise it started has to settle before the
  // notice it may have raised can be looked for.
  await act(async () => { await Promise.resolve(); });
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

const CHANGE_PATH = 'src/app/greeting.ts';
const BEFORE = 'const message = "hello";';
const AFTER = 'const message = "hello there";';

function runChange(overrides: Partial<CodeChange> = {}): CodeChange {
  return {
    id: 'change-greeting',
    itemId: 'item-greeting',
    path: CHANGE_PATH,
    before: BEFORE,
    after: AFTER,
    createOnly: false,
    createdBy: 'builder',
    attempt: 1,
    ...overrides,
  };
}

function runWithItemStatus(id: string, status: WorkItem['status'], at: string): Run {
  return {
    id,
    brief: 'Wire the reviewed change into the results studio.',
    status: 'completed',
    teamId: 'team-default',
    items: [{ id: 'item-greeting', title: CHANGE_PATH, kind: 'code', agentId: 'builder', dependsOn: [], status, artifactIds: [] }],
    messages: [],
    artifacts: [],
    changes: [runChange()],
    createdAt: at,
    updatedAt: at,
  };
}

async function mountResultsStudio(props: Record<string, unknown>): Promise<{ tree: ReactTestRenderer; onReject: jest.Mock }> {
  const onReject = jest.fn();
  const tree = await mount(React.createElement(ResultsStudio as React.ComponentType<any>, {
    run: null,
    history: [],
    projectRoot: 'Z:\\fixture-project',
    onApply: jest.fn(),
    onReject,
    onAcceptArtifact: jest.fn(),
    onSaveRecipe: jest.fn(),
    onUndo: jest.fn(),
    onOpenRun: jest.fn(),
    ...props,
  }));
  return { tree, onReject };
}

// ---------------------------------------------------------------------------
// Comparing two runs
// ---------------------------------------------------------------------------

test('a work item that reached a different status is reported as a different run', () => {
  const left = runWithItemStatus('run-left', 'done', '2026-10-19T08:00:00.000Z');
  const right = runWithItemStatus('run-right', 'failed', '2026-10-19T09:00:00.000Z');

  const comparison = compareRuns(left, right);

  const item = comparison.items.find(entry => entry.id === 'item-greeting');
  expect(item).toBeDefined();
  expect(item?.leftStatus).toBe('done');
  expect(item?.rightStatus).toBe('failed');
  // The difference is the point of the comparison, so it is carried on the item itself and
  // not only in a summary line.
  expect(item?.differs).toBe(true);
  expect(comparison.differs).toBe(true);
  expect(comparison.rows.find(row => row.key === 'items')?.differs).toBe(true);
});

test('two runs that agree on every measured point are not reported as different', () => {
  const at = '2026-10-19T08:00:00.000Z';
  const left = runWithItemStatus('run-left', 'done', at);
  const right = runWithItemStatus('run-right', 'done', at);

  const comparison = compareRuns(left, right);

  expect(comparison.items.every(item => !item.differs)).toBe(true);
  expect(comparison.differs).toBe(false);
});

test('the comparison panel puts the two runs side by side and names the differences', async () => {
  const run = runWithItemStatus('run-current', 'done', '2026-10-19T08:00:00.000Z');
  const earlier = runWithItemStatus('run-earlier', 'failed', '2026-10-19T07:00:00.000Z');
  const { tree } = await mountResultsStudio({ run, history: [earlier] });

  const compare = controlsMatching(tree.toJSON(), /^compare$/i)[0];
  if (!compare) throw new Error('the results surface offers no way to compare two runs');
  await pressControl(compare);

  const panel = tree.root.findAll(node => node.props.testID === 'run-comparison' && (node.type as string) === 'View');
  expect(panel).toHaveLength(1);
  const rendered = subtreeText(tree.toJSON());
  // The difference is named in words, so it survives grayscale and a screen reader.
  expect(rendered).toContain('differs');
  expect(rendered).toContain('done');
  expect(rendered).toContain('failed');
  await unmount(tree);
});

// ---------------------------------------------------------------------------
// Exporting from the results surface
// ---------------------------------------------------------------------------

test('a cancelled export says nothing, because nothing went wrong', async () => {
  (saveChangeAs as jest.Mock).mockClear();
  const run = runWithItemStatus('run-current', 'done', '2026-10-19T08:00:00.000Z');
  const { tree } = await mountResultsStudio({ run });

  const save = controlsMatching(tree.toJSON(), /^save change as/i)[0];
  if (!save) throw new Error('the results surface offers no way to export a change');
  await pressControl(save);

  expect(saveChangeAs).toHaveBeenCalledTimes(1);
  // Neither a success notice nor a failure notice: the person closed the dialog, and a
  // screen that reported a failure for that would be lying about the state of the file.
  expect(tree.root.findAll(node => node.props.testID === 'results-export-notice')).toHaveLength(0);
  const rendered = subtreeText(tree.toJSON());
  expect(rendered).not.toContain(`Saved ${CHANGE_PATH}`);
  expect(rendered).not.toContain('Could not save');
  await unmount(tree);
});

// ---------------------------------------------------------------------------
// Notices
// ---------------------------------------------------------------------------

test('a failure notice reads differently from a success notice', async () => {
  const success = await mount(React.createElement(Toast, { title: 'Saved the review', tone: 'success' }));
  const critical = await mount(React.createElement(Toast, { title: 'Could not save the review', tone: 'critical' }));

  const successTree = JSON.stringify(success.toJSON());
  const criticalTree = JSON.stringify(critical.toJSON());

  // The tone is carried by a word as well as a colour, so the two notices are different
  // documents even to a reader who cannot see the colour.
  expect(successTree).toContain('Done');
  expect(successTree).not.toContain('Error');
  expect(criticalTree).toContain('Error');
  expect(criticalTree).not.toContain('Done');
  expect(successTree).not.toEqual(criticalTree);
  await unmount(success);
  await unmount(critical);
});

// ---------------------------------------------------------------------------
// Destructive actions
// ---------------------------------------------------------------------------

test('rejecting a change asks first, and only rejects once the person confirms', async () => {
  const run = runWithItemStatus('run-current', 'done', '2026-10-19T08:00:00.000Z');
  const { tree, onReject } = await mountResultsStudio({ run });

  const reject = controlsMatching(tree.toJSON(), /^reject$/i)[0];
  if (!reject) throw new Error('the proposal offers no reject control');
  await pressControl(reject);

  // Nothing has been rejected yet: the press opened the question.
  expect(onReject).not.toHaveBeenCalled();
  expect(subtreeText(tree.toJSON())).toContain('Reject this change?');

  const confirm = controlsMatching(tree.toJSON(), /^reject change$/i)[0];
  if (!confirm) throw new Error('the confirmation offers no way to reject');
  await pressControl(confirm);

  expect(onReject).toHaveBeenCalledTimes(1);
  expect(onReject).toHaveBeenCalledWith(run, 'change-greeting');
  await unmount(tree);
});
