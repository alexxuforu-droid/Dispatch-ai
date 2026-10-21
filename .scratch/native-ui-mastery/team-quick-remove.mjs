// One more line of the plan's invisible layer: a member leaves the team without opening the
// editor first. The editor still exists for the full edit; this is the one-keystroke way
// out of a team that grew a member it should not have.
import fs from 'node:fs';

const file = 'App.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS', from.slice(0, 90)); return; }
  text = text.replace(from, to);
};

// The handler, next to the other team mutations.
swap(
  "  const activateTeam = (team: SavedTeam) => { setActiveTeamId(team.id); setRoles(availableRoles.filter(role => team.agentIds.includes(role.id))); };",
  `  const activateTeam = (team: SavedTeam) => { setActiveTeamId(team.id); setRoles(availableRoles.filter(role => team.agentIds.includes(role.id))); };
  // A member leaves the team from the team card, without the editor. A team with no members
  // cannot plan anything, so that is refused with the reason.
  const removeRoleFromTeam = (roleId: string) => {
    const team = savedTeams.find(candidate => candidate.id === activeTeamId);
    if (!team) { setNotice('There is no saved team to remove an agent from.'); return; }
    const next = team.agentIds.filter(id => id !== roleId);
    if (!next.length) { setNotice('A team needs at least one agent. Edit the team to choose another one.'); return; }
    const role = availableRoles.find(candidate => candidate.id === roleId);
    setSavedTeams(current => current.map(candidate => candidate.id === team.id ? { ...candidate, agentIds: next } : candidate));
    setRoles(availableRoles.filter(candidate => next.includes(candidate.id)));
    setNotice(\`\${role?.label ?? 'The agent'} removed from \${team.name}.\`);
  };`);

// The prop, and the call site.
swap(
  'function CollectionHome({ screen, roles, agentModels, agentAvatars, agentPermissions, agentRanks, setAgentRank, setAgentAvatar, setAgentModel, setAgentPermission, history, providerReady, onCreate, onUseTeam, onOpenRun }:',
  'function CollectionHome({ screen, roles, agentModels, agentAvatars, agentPermissions, agentRanks, setAgentRank, setAgentAvatar, setAgentModel, setAgentPermission, history, providerReady, onCreate, onUseTeam, onOpenRun, onRemoveRole }:',
);
swap(
  'onCreate: () => void; onUseTeam: () => void; onOpenRun: (run: Run) => void }) {',
  'onCreate: () => void; onUseTeam: () => void; onOpenRun: (run: Run) => void; onRemoveRole?: (roleId: string) => void }) {',
);
swap(
  'history={runHistory} providerReady={providerReady} onCreate={screen === \'runs\'',
  'history={runHistory} providerReady={providerReady} onRemoveRole={removeRoleFromTeam} onCreate={screen === \'runs\'',
);

// The action on each member row.
swap(
  `<Text style={styles.savedRoleState}>{agentModels[role.id]?.trim() ? 'Custom model' : providerReady ? 'Default model' : 'Provider needed'}</Text></View>)}</View>`,
  `<Text style={styles.savedRoleState}>{agentModels[role.id]?.trim() ? 'Custom model' : providerReady ? 'Default model' : 'Provider needed'}</Text>{onRemoveRole ? <FocusPressable accessibilityRole="button" accessibilityLabel={\`Remove \${role.label} from the team\`} onPress={() => onRemoveRole(role.id)} style={({ pressed }) => [styles.textAction, pressed && styles.pressed]}><Text style={styles.textAction}>Remove</Text></FocusPressable> : null}</View>)}</View>`,
);

fs.writeFileSync(file, text, 'utf8');
console.log('quick remove added to the team card');
