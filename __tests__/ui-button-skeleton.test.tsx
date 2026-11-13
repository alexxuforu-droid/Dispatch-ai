/**
 * The ported web button spec and the skeleton kit, proved through the rendered UI.
 *
 * - Primary is the web fill with a white label; disabled is opacity only; pressed is a scale.
 * - Ghost keeps a hairline border that turns accent on hover; critical is the transparent
 *   red outline with red text.
 * - Skeleton renders as a static neutral block under NODE_ENV=test, SkeletonGate shows its
 *   blocks immediately in test mode (no timers), and both screens use them while loading.
 */
import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

jest.mock('../src/persistence/usageLedger', () => {
  const actual = jest.requireActual('../src/persistence/usageLedger');
  return {
    ...actual,
    // Never resolves, so the usage screen stays in its loading branch for the whole test.
    readUsageResult: jest.fn(() => new Promise(() => {})),
    readUsageSummary: jest.fn(() => new Promise(() => {})),
  };
});

jest.mock('../src/persistence/workspaceProject', () => ({
  listProjectFiles: jest.fn(() => new Promise(() => {})),
  loadProjectRoot: jest.fn(async () => 'C:\\proj'),
  readProjectText: jest.fn(async () => ''),
  selectProjectFolder: jest.fn(async () => null),
}));

import { colors, radius } from '../src/theme';
import { Button, Skeleton, SkeletonGate } from '../src/ui';
import { FocusPressable } from '../src/Reveal';
import { UsageHome } from '../src/app/views/library/UsageHome';
import { WorkspaceSettings } from '../src/app/views/settings/WorkspaceSettings';

type TreeNode = { type: string; props: Record<string, unknown>; children?: (string | TreeNode)[] | string | null };
type TreeRoot = TreeNode | string | null | TreeNode[];

function collect(node: TreeRoot, visit: (n: TreeNode) => void): void {
  if (!node || typeof node === 'string') return;
  if (Array.isArray(node)) { node.forEach(kid => collect(kid, visit)); return; }
  visit(node);
  collect((node.children ?? null) as TreeRoot, visit);
}

function findByTestID(node: TreeRoot, testID: string): TreeNode | null {
  let hit: TreeNode | null = null;
  collect(node, n => { if (!hit && n.props?.testID === testID) hit = n; });
  return hit;
}

function findText(node: TreeRoot, text: string): TreeNode | null {
  let hit: TreeNode | null = null;
  collect(node, n => {
    if (hit || n.type !== 'Text') return;
    const kids = n.children ?? [];
    if (Array.isArray(kids) && kids.includes(text)) hit = n;
  });
  return hit;
}

/** Every style object on the node, flattening nested arrays the way the renderer does. */
function allStyles(node: TreeNode): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const walk = (style: unknown): void => {
    if (!style) return;
    if (Array.isArray(style)) { style.forEach(walk); return; }
    if (typeof style === 'object') out.push(style as Record<string, unknown>);
  };
  walk(node.props?.style);
  return out;
}

function textContent(node: TreeRoot): string {
  let out = '';
  const gather = (x: TreeRoot): void => {
    if (!x) return;
    if (typeof x === 'string') { out += x; return; }
    if (Array.isArray(x)) { x.forEach(gather); return; }
    gather((x.children ?? null) as TreeRoot);
  };
  gather(node);
  return out;
}

async function mount(element: React.ReactElement): Promise<ReactTestRenderer> {
  let tree!: ReactTestRenderer;
  await act(async () => { tree = renderer.create(element); });
  return tree;
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>(resolve => { setTimeout(resolve, 0); }); });
}

/** The Button's own style resolution, without the animated hover fill layered on top. */
function buttonStyles(tree: ReactTestRenderer): Record<string, unknown>[] {
  const style = tree.root.findByType(FocusPressable).props.style as (state: { pressed: boolean }) => unknown;
  return allStyles({ type: 'View', props: { style: style({ pressed: false }) } });
}

test('primary button carries the web spec: violet fill, white label, control radius, 44px floor', async () => {
  const tree = await mount(<Button label="Start run" onPress={() => {}} variant="primary" testID="btn" />);
  const node = findByTestID(tree.toJSON(), 'btn');
  expect(node).not.toBeNull();
  const styles = buttonStyles(tree);
  expect(styles.some(s => s.backgroundColor === colors.buttonPrimary && s.borderColor === colors.buttonPrimary)).toBe(true);
  expect(styles.some(s => s.minHeight === 44 && s.borderRadius === radius.control && s.borderWidth === 1)).toBe(true);
  const label = findText(tree.toJSON(), 'Start run');
  expect(label).not.toBeNull();
  expect(allStyles(label as TreeNode).some(s => s.color === colors.buttonPrimaryInk)).toBe(true);
  await act(async () => { tree.unmount(); });
});

test('disabled button is opacity only, keeping its own fill and shape', async () => {
  const tree = await mount(<Button label="Start run" onPress={() => {}} variant="primary" disabled testID="btn" />);
  const node = findByTestID(tree.toJSON(), 'btn') as TreeNode;
  expect(node.props.accessibilityState).toMatchObject({ disabled: true });
  const styles = buttonStyles(tree);
  expect(styles.some(s => s.opacity === 0.45)).toBe(true);
  // No fill swap: the disabled control keeps the primary fill it had.
  expect(styles.some(s => s.backgroundColor === colors.buttonPrimary)).toBe(true);
  expect(styles.some(s => s.backgroundColor === colors.surface && s.opacity !== undefined)).toBe(false);
  await act(async () => { tree.unmount(); });
});

test('pressed scales the button to 0.97 instead of dimming it', async () => {
  const tree = await mount(<Button label="Go" onPress={() => {}} variant="secondary" testID="btn" />);
  expect(allStyles(findByTestID(tree.toJSON(), 'btn') as TreeNode).some(s => Array.isArray(s.transform))).toBe(false);
  const pressedStyle = tree.root.findByType(FocusPressable).props.style({ pressed: true });
  const styles = allStyles({ type: 'View', props: { style: pressedStyle } });
  const scaled = styles.some(s => Array.isArray(s.transform) && (s.transform as { scale?: number }[])[0]?.scale === 0.97);
  expect(scaled).toBe(true);
  await act(async () => { tree.unmount(); });
});

test('ghost button keeps a hairline border that turns accent on hover', async () => {
  const tree = await mount(<Button label="Repair" onPress={() => {}} variant="ghost" testID="btn" />);
  const before = buttonStyles(tree);
  expect(before.some(s => s.backgroundColor === 'transparent' && s.borderColor === colors.line)).toBe(true);
  await act(async () => { tree.root.findByType(FocusPressable).props.onHoverIn({}); });
  const after = buttonStyles(tree);
  expect(after.some(s => s.borderColor === colors.buttonGhostHoverBorder)).toBe(true);
  await act(async () => { tree.unmount(); });
});

test('critical button is the transparent red outline with red text', async () => {
  const tree = await mount(<Button label="Stop run" onPress={() => {}} variant="critical" testID="btn" />);
  const styles = buttonStyles(tree);
  expect(styles.some(s => s.backgroundColor === 'transparent' && s.borderColor === colors.buttonCriticalBorder)).toBe(true);
  const label = findText(tree.toJSON(), 'Stop run');
  expect(allStyles(label as TreeNode).some(s => s.color === colors.buttonCritical)).toBe(true);
  await act(async () => { tree.unmount(); });
});

test('skeleton renders as a static neutral block in the test environment', async () => {
  const tree = await mount(<Skeleton testID="sk" style={{ height: 42 }} />);
  const node = findByTestID(tree.toJSON(), 'sk') as TreeNode;
  expect(node.type).toBe('View');
  const styles = allStyles(node);
  expect(styles.some(s => s.backgroundColor === colors.surfaceRaised && s.borderRadius === radius.chip)).toBe(true);
  expect(styles.some(s => s.height === 42)).toBe(true);
  await act(async () => { tree.unmount(); });
});

test('skeleton gate shows its blocks immediately in test mode and hides them when inactive', async () => {
  const on = await mount(<SkeletonGate active><Skeleton testID="sk-on" /></SkeletonGate>);
  expect(findByTestID(on.toJSON(), 'sk-on')).not.toBeNull();
  await act(async () => { on.unmount(); });
  const off = await mount(<SkeletonGate active={false}><Skeleton testID="sk-off" /></SkeletonGate>);
  expect(findByTestID(off.toJSON(), 'sk-off')).toBeNull();
  await act(async () => { off.unmount(); });
});

test('usage home shows shaped skeleton blocks while the ledger is loading', async () => {
  const tree = await mount(<UsageHome onNotice={() => {}} />);
  await settle();
  expect(findByTestID(tree.toJSON(), 'usage-loading-skeleton')).not.toBeNull();
  expect(textContent(tree.toJSON())).not.toContain('Reading usage history');
  await act(async () => { tree.unmount(); });
});

test('workspace settings shows skeleton rows while the folder listing loads', async () => {
  const tree = await mount(<WorkspaceSettings onAddFileContext={() => {}} onProjectRootChange={() => {}} />);
  await settle();
  expect(findByTestID(tree.toJSON(), 'workspace-loading-skeleton')).not.toBeNull();
  await act(async () => { tree.unmount(); });
});
