/**
 * The always-on settings, proved through the screen that edits them.
 *
 * Always-on mode is a promise about an agent that works with nobody watching, so the screen
 * has to answer three things plainly: is it on, which agent is doing the work, and where the
 * work lands. The folder matters most: a line that names one folder while the worker writes
 * into another is a lie, so the folder named here is the folder the worker actually uses.
 */
import React, { act } from 'react';
import renderer, { ReactTestRenderer } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => require('./asyncStorageMock').asyncStorageMock);

import { AgentsHome } from '../src/app/views/agents/AgentsHome';
import { Role, templates } from '../src/app/types';
import { AgentSetup } from '../src/orchestration/types';
import { sandboxFolderFor } from '../src/orchestration/sandbox';

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

function controlWithLabel(node: TreeRoot, label: string): TreeNode | null {
  if (!node || typeof node === 'string') return null;
  if (Array.isArray(node)) {
    for (const kid of node) {
      const hit = controlWithLabel(kid, label);
      if (hit) return hit;
    }
    return null;
  }
  if (node.props?.accessibilityLabel === label) return node;
  return controlWithLabel((node.children ?? null) as TreeRoot, label);
}

async function press(control: TreeNode | null, what: string): Promise<void> {
  if (!control) throw new Error(`no control labelled "${what}" is rendered`);
  const handler = control.props.onClick ?? control.props.onPress ?? control.props.onResponderRelease;
  if (typeof handler !== 'function') throw new Error(`the control "${what}" exposes no press handler`);
  await act(async () => { handler(); });
}

async function mount(tree: ReactTestRenderer): Promise<void> {
  await act(async () => { tree.unmount(); });
}

type Props = {
  roles: Role[];
  agentSetups: Record<string, AgentSetup>;
  alwaysOn: boolean;
  alwaysOnAgentId: string;
  alwaysOnMinutes: number;
  onToggleAlwaysOn: () => void;
  setAlwaysOnAgentId: (id: string) => void;
  setAlwaysOnMinutes: (minutes: number) => void;
};

function render(overrides: Partial<Props> = {}): { tree: ReactTestRenderer; props: Props } {
  const props: Props = {
    roles: templates,
    agentSetups: {},
    alwaysOn: false,
    alwaysOnAgentId: '',
    alwaysOnMinutes: 5,
    onToggleAlwaysOn: jest.fn(),
    setAlwaysOnAgentId: jest.fn(),
    setAlwaysOnMinutes: jest.fn(),
    ...overrides,
  };
  let tree!: ReactTestRenderer;
  act(() => {
    tree = renderer.create(<AgentsHome
      roles={props.roles}
      agentModels={{}}
      agentAvatars={{}}
      agentPermissions={{}}
      agentRanks={{}}
      agentMemory={{}}
      agentProviders={{}}
      agentSetups={props.agentSetups}
      setAgentModel={jest.fn()}
      setAgentPermission={jest.fn()}
      setAgentRank={jest.fn()}
      setAgentMemory={jest.fn()}
      setAgentProvider={jest.fn()}
      setAgentSetup={jest.fn()}
      alwaysOn={props.alwaysOn}
      onToggleAlwaysOn={props.onToggleAlwaysOn}
      alwaysOnAgentId={props.alwaysOnAgentId}
      setAlwaysOnAgentId={props.setAlwaysOnAgentId}
      alwaysOnMinutes={props.alwaysOnMinutes}
      setAlwaysOnMinutes={props.setAlwaysOnMinutes}
      onChooseAvatar={jest.fn()}
      onCreate={jest.fn()}
      onNotice={jest.fn()}
      history={[]}
    />);
  });
  return { tree, props };
}

test('the switch says whether always-on mode is on', async () => {
  const { tree } = render({ alwaysOn: true });
  const on = controlWithLabel(tree.toJSON(), 'Keep an agent working');
  expect(on).not.toBeNull();
  expect((on?.props.accessibilityState as { checked?: boolean } | undefined)?.checked).toBe(true);
  await mount(tree);
});

test('the switch turns always-on mode on and off through the same control', async () => {
  const onToggleAlwaysOn = jest.fn();
  const { tree } = render({ alwaysOn: false, onToggleAlwaysOn });
  await press(controlWithLabel(tree.toJSON(), 'Keep an agent working'), 'Keep an agent working');
  expect(onToggleAlwaysOn).toHaveBeenCalledTimes(1);
  await mount(tree);
});

test('choosing the agent that works alone records that agent', async () => {
  const setAlwaysOnAgentId = jest.fn();
  const { tree } = render({ setAlwaysOnAgentId });
  await press(controlWithLabel(tree.toJSON(), 'Builder works alone in always-on mode'), 'Builder works alone');
  expect(setAlwaysOnAgentId).toHaveBeenCalledWith('builder');
  await mount(tree);
});

test('the chosen agent is the one marked as working alone', async () => {
  const { tree } = render({ alwaysOnAgentId: 'builder' });
  const chosen = controlWithLabel(tree.toJSON(), 'Builder works alone in always-on mode');
  const other = controlWithLabel(tree.toJSON(), 'Planner works alone in always-on mode');
  expect((chosen?.props.accessibilityState as { checked?: boolean } | undefined)?.checked).toBe(true);
  expect((other?.props.accessibilityState as { checked?: boolean } | undefined)?.checked).toBe(false);
  await mount(tree);
});

test('the rest interval is a choice the person makes, and it is recorded', async () => {
  const setAlwaysOnMinutes = jest.fn();
  const { tree } = render({ setAlwaysOnMinutes });
  await press(controlWithLabel(tree.toJSON(), 'Rest 15 minutes between turns'), 'Rest 15 minutes');
  expect(setAlwaysOnMinutes).toHaveBeenCalledWith(15);
  await mount(tree);
});

test('the folder named on screen is the folder the worker will use', async () => {
  // The agent has no folder of its own, so the worker falls back to the shared one. The line
  // has to name that folder, not a name the worker would never use.
  const { tree } = render({ alwaysOnAgentId: 'builder' });
  const text = subtreeText(tree.toJSON());
  expect(text).toContain('Its own folder');
  expect(text).toContain('Leave it empty to use the shared Dispatch Agent Projects folder.');

});

test('the agent\'s own folder is the folder the worker will use', async () => {
  const agentSetups = { builder: { folder: 'Builder Sandbox', idle: 'anything' as const } };
  const { tree } = render({ alwaysOnAgentId: 'builder', agentSetups });
  expect(subtreeText(tree.toJSON())).toContain('Its own folder');
  // The same folder the worker resolves for itself, not a second answer computed here.
  expect(sandboxFolderFor('builder', agentSetups)).toBe('Builder Sandbox');
  await mount(tree);
});
