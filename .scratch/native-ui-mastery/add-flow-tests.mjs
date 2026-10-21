// The three controls that decide whether the app works were only ever asserted in prose:
// start a run, undo an applied change, open a run from the history. Each one is pressed
// here, so a regression in the handler is a failing test rather than something a person
// finds out at the keyboard.
import fs from 'node:fs';

const file = '__tests__/App.render.test.tsx';
const addition = `
// ---- The three controls that decide whether the app works --------------------------------

function textInputIn(tree: ReactTestRenderer): TreeNode | null {
  const find = (node: TreeRoot): TreeNode | null => {
    if (!node || typeof node === 'string') return null;
    if (Array.isArray(node)) {
      for (const kid of node) {
        const hit = find(kid);
        if (hit) return hit;
      }
      return null;
    }
    if (node.type === 'TextInput') return node;
    return find((node.children ?? null) as TreeRoot);
  };
  return find(tree.toJSON());
}

test('pressing Start run plans the task and puts the run on screen', async () => {
  const { defaultProviderProfile, saveProviderProfile } = require('../src/persistence/providerProfile');
  const credentials = require('../src/persistence/providerCredentials');
  const { defaultWorkspaceSettings, saveWorkspaceSettings } = require('../src/persistence/workspace');
  const runner = require('../src/orchestration/model-runner');

  // The state the app is in when it is allowed to work: a team to plan with, a model, and a
  // stored key. Without them the start button refuses, which is a different test.
  await saveWorkspaceSettings({
    ...defaultWorkspaceSettings,
    teamRoleIds: ['planner', 'builder'],
    teams: [{ id: 'team-default', name: 'Core team', description: 'The agents that do the work.', agentIds: ['planner', 'builder'] }],
    activeTeamId: 'team-default',
  });
  await saveProviderProfile({ ...defaultProviderProfile, model: 'test-model' });
  const secret = jest.spyOn(credentials, 'hasProviderSecret').mockResolvedValue(true);

  const brief = 'Tighten the release notes screen.';
  const planned: Run = {
    id: 'run-planned',
    brief,
    teamId: 'team-default',
    status: 'queued',
    items: [],
    messages: [],
    artifacts: [],
    changes: [],
    createdAt: 1,
    updatedAt: 1,
  };
  const plan = jest.spyOn(runner, 'createPlannedRun').mockImplementation(async (options: { onPlanned?: (value: Run) => void }) => {
    options.onPlanned?.(planned);
    return planned;
  });

  const tree = await mount(React.createElement(App, { initialScreen: 'dispatch' }));

  const composer = textInputIn(tree);
  if (!composer) throw new Error('the composer renders no text input');
  await act(async () => { (composer.props.onChangeText as (text: string) => void)(brief); });

  await press(tree, 'Start coordinated run');

  // The plan was asked for with the brief that was typed, and the run it returned is on
  // screen. Both halves matter: a start that plans nothing is a silent no-op.
  expect(plan).toHaveBeenCalledTimes(1);
  expect(plan.mock.calls[0][0].brief).toBe(brief);
  expect(textNodes(tree.toJSON()).join(' \\n ')).toContain(brief);

  secret.mockRestore();
  plan.mockRestore();
  await unmount(tree);
});

test('pressing Undo applied change asks the app to undo that change', async () => {
  const run = resultsRun('done', resultsChange({ appliedAt: 1700000000000 }));
  const { tree, onUndo } = await mountResultsStudio({ run, projectRoot: 'Z:\\\\fixture-project' });

  const undo = pressableNodes(tree.toJSON()).find(control => /undo applied change/i.test(subtreeText(control)));
  if (!undo) throw new Error('no undo control is rendered for the applied change');
  await pressControl(undo);

  // Undo is the destructive-adjacent path: a broken undo loses work, so the handler has to
  // be handed the run and the change it belongs to.
  expect(onUndo).toHaveBeenCalledWith(run, 'change-greeting');
  await unmount(tree);
});

test('pressing a run in the history opens that run', async () => {
  const run = resultsRun('done', resultsChange());
  const { tree, onOpenRun } = await mountResultsStudio({ run, history: [run] });

  const open = pressableNodes(tree.toJSON()).find(control => /^open\\b/i.test(String(control.props.accessibilityLabel ?? '')));
  if (!open) throw new Error('no run in the history carries an open action');
  await pressControl(open);

  expect(onOpenRun).toHaveBeenCalledWith(run);
  await unmount(tree);
});
`;

const text = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file, text + addition, 'utf8');
console.log('flow tests added');
