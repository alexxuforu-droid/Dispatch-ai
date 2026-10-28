/**
 * The interaction rules, proved through the rendered UI.
 *
 * Four promises, each of them a thing that used to be missing or untrue:
 *   - a failure is reported as a failure, in the tone that says so;
 *   - a change whose contents were never stored is refused, not written as a placeholder;
 *   - deleting a team asks first, and the notice can put it back;
 *   - a cancelled export says nothing, because nothing happened.
 *
 * The first one is driven through the whole App, because the tone lives in the composition
 * root. The other three are driven through the pieces that own them, so a failure points at
 * the piece that caused it.
 */
import React, { act, useCallback, useState } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

jest.mock('react-native-safe-area-context', () => {
  const ReactActual = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => ReactActual.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

// The native save dialog cannot be reached from jest. It is stubbed at the boundary that
// matters: the copy either happens and hands back a path, or it is cancelled and hands back
// nothing. The cancelled case is the one this file pins.
jest.mock('../src/exporter', () => {
  const actual = jest.requireActual('../src/exporter');
  return { ...actual, saveArtifactAs: jest.fn(async () => null) };
});

import { colors } from '../src/theme';
import { Button, Toast, ToastSlot } from '../src/ui';
import { applyCodeChange, undoCodeChange } from '../src/app/controllers/applyController';
import type { NoticeTone } from '../src/app/controllers/types';
import { ImageArtifactCard } from '../src/app/views/library/ImageArtifactCard';
import { TeamsHome } from '../src/app/views/teams/TeamsHome';
import type { Role, SavedTeam } from '../src/app/types';
import { ELIDED_CHANGE_PAYLOAD, type StoredCodeChange } from '../src/persistence/runStore';
import type { Artifact, Run } from '../src/orchestration/types';
import { resetAsyncStorageMock, storageBacking } from './asyncStorageMock';

const App = require('../App').default;

// Mounting the whole App costs several seconds, so a single test run with -t would trip the
// default timeout and report a failure that is only a timeout.
jest.setTimeout(60000);

type TreeNode = { type: string; props: Record<string, unknown>; children?: (string | TreeNode)[] | string | null };
type TreeRoot = TreeNode | string | null | TreeNode[];

function findByLabel(node: TreeRoot, label: string): TreeNode | null {
  if (!node || typeof node === 'string') return null;
  if (Array.isArray(node)) {
    for (const kid of node) {
      const hit = findByLabel(kid, label);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props?.accessibilityLabel === label) return node;
  return findByLabel((node.children ?? null) as TreeRoot, label);
}

function findByRole(node: TreeRoot, role: string): TreeNode | null {
  if (!node || typeof node === 'string') return null;
  if (Array.isArray(node)) {
    for (const kid of node) {
      const hit = findByRole(kid, role);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props?.accessibilityRole === role) return node;
  return findByRole((node.children ?? null) as TreeRoot, role);
}

/** The style objects a node carries, so a tone can be read off the tree rather than guessed. */
function styleObjects(node: TreeNode): Record<string, unknown>[] {
  const style = node.props?.style;
  const list = Array.isArray(style) ? style : [style];
  return list.filter((entry): entry is Record<string, unknown> => !!entry && typeof entry === 'object');
}

function textNodes(tree: TreeRoot): string[] {
  if (!tree) return [];
  if (typeof tree === 'string') return [tree];
  if (Array.isArray(tree)) return tree.flatMap(textNodes);
  const kids = tree.children;
  const own = typeof kids === 'string' ? [kids] : Array.isArray(kids) ? kids.filter((kid): kid is string => typeof kid === 'string') : [];
  // A screen reader hears the accessible name too, so a figure smuggled into one is as
  // visible to a person as one printed on screen.
  const label = typeof tree.props?.accessibilityLabel === 'string' ? [tree.props.accessibilityLabel] : [];
  const nested = Array.isArray(kids) ? kids.filter((kid): kid is TreeNode => typeof kid === 'object' && kid !== null).flatMap(textNodes) : [];
  return [...own, ...label, ...nested];
}

async function press(tree: ReactTestRenderer, label: string): Promise<void> {
  const node = findByLabel(tree.toJSON(), label);
  if (!node) throw new Error(`no node labelled "${label}" is rendered`);
  const handler = node.props.onClick ?? node.props.onPress ?? node.props.onResponderRelease;
  if (typeof handler !== 'function') throw new Error(`node "${label}" exposes no press handler`);
  await act(async () => { handler(); });
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>(resolve => { setTimeout(resolve, 0); }); });
}

async function mount(element?: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(element ?? React.createElement(App)); });
  return tree;
}

async function unmount(tree: ReactTestRenderer): Promise<void> {
  await act(async () => { tree.unmount(); });
}

beforeEach(() => { resetAsyncStorageMock(); });

test('a failure notice renders in the critical tone', async () => {
  // A history that cannot be read is not an empty history. The unreadable value is still on
  // the device, so the app has to say so, and it has to say it as a failure.
  storageBacking.set('dispatch.runs.index.v1', JSON.stringify(['run-broken']));
  storageBacking.set('dispatch.run.run-broken.snapshot.v1', '{ this is not json');

  const tree = await mount(React.createElement(App));
  await settle();

  const rendered = textNodes(tree.toJSON()).join(' \n ');
  expect(rendered).toContain('Saved run history could not be read');
  // The tone is carried by a word as well as by a colour, so it survives grayscale and a
  // screen reader. "Error" is the critical tone's word; "Attention" and "Done" are the others.
  expect(rendered).toContain('Error');

  // And the tone really is critical, read off the notice itself rather than off the copy.
  const toast = findByRole(tree.toJSON(), 'alert');
  expect(toast).not.toBeNull();
  expect(styleObjects(toast as TreeNode).some(style => style.backgroundColor === colors.criticalSurface)).toBe(true);
  expect(styleObjects(toast as TreeNode).some(style => style.backgroundColor === colors.surfaceRaised && style.borderColor === colors.line)).toBe(false);

  await unmount(tree);
});

test('a change whose contents were never stored cannot be applied or undone', async () => {
  // A change too large to keep is stored with its contents replaced by a placeholder. Writing
  // that placeholder into the project would put the words "[elided: ...]" into a source file,
  // so the change is refused instead.
  const elided: StoredCodeChange = {
    id: 'change-elided', itemId: 'item-large', path: 'src/app/large.ts',
    before: ELIDED_CHANGE_PAYLOAD, after: ELIDED_CHANGE_PAYLOAD,
    createOnly: false, createdBy: 'builder', attempt: 1, payloadElided: true,
  };
  const runWith = (change: StoredCodeChange): Run => ({
    id: 'run-elided', brief: 'Write a very large file.', status: 'completed', teamId: 'team-default',
    items: [{ id: 'item-large', title: 'src/app/large.ts', kind: 'code', agentId: 'builder', dependsOn: [], status: 'done', artifactIds: [] }],
    messages: [], artifacts: [], changes: [change],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  });
  const applyFile = jest.fn(async () => 'written');
  const removeFile = jest.fn(async () => '');

  const applied = await applyCodeChange({ run: runWith(elided), changeId: elided.id, projectRoot: 'C:\\work', applying: false, applyFile });
  if (applied.outcome !== 'blocked') throw new Error(`the apply was not blocked, it was ${applied.outcome}`);
  expect(applied.message).toContain('payload was too large');
  expect(applyFile).not.toHaveBeenCalled();

  // The undo is refused for the same reason. This is the case the elision reaches: a change
  // that was applied, and whose stored payload was dropped when the run was saved again, so
  // there is nothing left to write back.
  const appliedChange: StoredCodeChange = { ...elided, appliedAt: '2026-01-02T00:00:00.000Z' };
  const undone = await undoCodeChange({ run: runWith(appliedChange), changeId: appliedChange.id, projectRoot: 'C:\\work', applyFile, removeFile });
  if (undone.outcome !== 'failed') throw new Error(`the undo was not refused, it was ${undone.outcome}`);
  expect(undone.message).toContain('payload was too large');
  expect(applyFile).not.toHaveBeenCalled();
  expect(removeFile).not.toHaveBeenCalled();
});

const TEAM: SavedTeam = { id: 'team-launch', name: 'Launch crew', description: 'Ships releases', agentIds: ['builder'] };
const BUILDER: Role = { id: 'builder', label: 'Builder', detail: 'Creates code outputs in the workspace.', glyph: 'build', kinds: ['code'] };

/**
 * The team screen with the notice the app itself would show, so the undo is pressed where a
 * person would press it: on the notice, not on a callback the test holds.
 */
function TeamsHarness() {
  const [teams, setTeams] = useState<SavedTeam[]>([TEAM]);
  const [notice, setNotice] = useState<{ text: string; tone: NoticeTone; undo: (() => void) | null } | null>(null);
  const report = useCallback((text: string, tone: NoticeTone = 'neutral', undo?: (() => void) | null) => {
    setNotice(text ? { text, tone, undo: undo ?? null } : null);
  }, []);
  return <>
    <TeamsHome
      savedTeams={teams}
      setSavedTeams={setTeams}
      activeTeamId={TEAM.id}
      activateTeam={() => {}}
      availableRoles={[BUILDER]}
      roles={[BUILDER]}
      agentAvatars={{}}
      agentPermissions={{}}
      agentRanks={{}}
      agentMemory={{}}
      setAgentMemory={() => {}}
      setAgentRank={() => {}}
      setAgentPermission={() => {}}
      history={[]}
      onOpenRun={() => {}}
      onMessageTeam={() => {}}
      onChooseRoles={() => {}}
      onNotice={report}
    />
    <ToastSlot>{notice ? <Toast
      title={notice.text}
      tone={notice.tone}
      action={notice.undo ? <Button label="Undo" onPress={() => { const undo = notice.undo; setNotice(null); undo?.(); }} variant="secondary" /> : undefined}
      onDismiss={() => setNotice(null)}
    /> : null}</ToastSlot>
  </>;
}

test('deleting a team asks for confirmation, and the notice can put it back', async () => {
  const tree = await mount(React.createElement(TeamsHarness));

  // The confirmation is not there before the delete is asked for.
  expect(findByLabel(tree.toJSON(), 'Delete team')).toBeNull();

  await press(tree, 'Delete');
  // The dialog names the team and the action, so nobody deletes the wrong thing by habit.
  expect(textNodes(tree.toJSON()).join(' \n ')).toContain('Delete Launch crew?');
  // ...and nothing has happened yet: the team is still on screen.
  expect(textNodes(tree.toJSON()).join(' \n ')).toContain('Ships releases');

  await press(tree, 'Delete team');
  const afterDelete = textNodes(tree.toJSON()).join(' \n ');
  // The team is gone from the list, and the notice says so and offers the way back.
  expect(afterDelete).not.toContain('Ships releases');
  expect(afterDelete).toContain('Launch crew deleted.');
  expect(findByLabel(tree.toJSON(), 'Undo')).not.toBeNull();

  await press(tree, 'Undo');
  const afterUndo = textNodes(tree.toJSON()).join(' \n ');
  expect(afterUndo).toContain('Ships releases');

  await unmount(tree);
});

test('a cancelled image export raises no notice', async () => {
  const onNotice = jest.fn();
  const artifact: Artifact = {
    id: 'artifact-hero', runId: 'run-1', kind: 'image', name: 'hero.png',
    uri: 'file:///C:/artifacts/hero.png', createdBy: 'visual',
  };
  const tree = await mount(React.createElement(ImageArtifactCard, { artifact, onNotice }));

  await press(tree, 'Save hero.png as a file');
  await settle();

  // The save dialog was cancelled: no file was written, so there is nothing to report. A
  // notice here would train the person to dismiss notices that mean nothing.
  expect(onNotice).not.toHaveBeenCalled();

  await unmount(tree);
});
