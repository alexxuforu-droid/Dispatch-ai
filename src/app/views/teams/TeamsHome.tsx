import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { defaultAgentPermissions } from '../../../persistence/workspace';
import { AgentPermissions, Run } from '../../../orchestration/types';
import { FocusPressable } from '../../../Reveal';
import { Button, Chip, EmptyState } from '../../../ui';
import { NoticeReporter } from '../../controllers/types';
import { SavedTeam, Role } from '../../types';
import { HierarchyAgentCard } from './HierarchyAgentCard';
import { AgentAvatar } from '../pickers/AgentAvatar';
import { ConfirmDialog } from '../ConfirmDialog';
import { styles } from '../styles';

const TeamsHomeImpl = React.memo(function TeamsHome({ savedTeams, setSavedTeams, activeTeamId, activateTeam, availableRoles, roles, agentAvatars, agentPermissions, agentRanks, agentMemory, setAgentMemory, setAgentRank, setAgentPermission, history, onOpenRun, onMessageTeam, onChooseRoles, onNotice }: { savedTeams: SavedTeam[]; setSavedTeams: React.Dispatch<React.SetStateAction<SavedTeam[]>>; activeTeamId: string; activateTeam: (team: SavedTeam) => void; availableRoles: Role[]; roles: Role[]; agentAvatars: Record<string, number>; agentPermissions: Record<string, AgentPermissions>; agentRanks: Record<string, number>; agentMemory: Record<string, string>; setAgentMemory: (roleId: string, value: string) => void; setAgentRank: (roleId: string, rank: number) => void; setAgentPermission: (roleId: string, key: keyof AgentPermissions, value: boolean) => void; history: Run[]; onOpenRun: (run: Run) => void; onMessageTeam: (brief: string) => void; onChooseRoles: () => void; onNotice: NoticeReporter }) {
  const [section, setSection] = useState<'hierarchy' | 'teams' | 'chat'>('teams');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [teamName, setTeamName] = useState('');
  const [teamDescription, setTeamDescription] = useState('');
  const [teamPlaybook, setTeamPlaybook] = useState('');
  const [teamAgents, setTeamAgents] = useState<string[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatFilter, setChatFilter] = useState<'all' | 'handoff' | 'review'>('all');
  const [teamPendingDelete, setTeamPendingDelete] = useState<SavedTeam | null>(null);
  const activeTeam = savedTeams.find(team => team.id === activeTeamId);
  const members = activeTeam ? availableRoles.filter(role => activeTeam.agentIds.includes(role.id)) : roles;
  const historyForTeam = history.filter(run => run.teamId === activeTeam?.id).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const messages = historyForTeam.flatMap(teamRun => teamRun.messages.map(message => ({ run: teamRun, message }))).filter(entry => chatFilter === 'all' || (chatFilter === 'handoff' ? entry.message.kind === 'handoff' || entry.message.kind === 'question' : entry.message.kind === 'finding'));
  const openEditor = (team?: SavedTeam) => { setEditorOpen(true); setEditingId(team?.id ?? null); setTeamName(team?.name ?? ''); setTeamDescription(team?.description ?? ''); setTeamPlaybook(team?.playbook ?? ''); setTeamAgents(team?.agentIds ?? (activeTeam?.agentIds ?? roles.map(role => role.id))); };
  const saveTeam = () => {
    const name = teamName.trim().slice(0, 60);
    if (!name) { onNotice('Give this team a name before saving.', 'attention'); return; }
    if (!teamAgents.length) { onNotice('Choose at least one existing agent for this team.', 'attention'); return; }
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 44) || 'custom';
    const id = editingId ?? `team-${slug}-${Date.now().toString(36)}`;
    const updated = { id, name, description: teamDescription.trim().slice(0, 240), playbook: teamPlaybook.trim().slice(0, 3000), agentIds: teamAgents };
    setSavedTeams(current => editingId ? current.map(team => team.id === editingId ? updated : team) : [...current, updated]);
    if (!savedTeams.some(team => team.id === activeTeamId) || activeTeamId === editingId) activateTeam(updated);
    setEditorOpen(false); setEditingId(null); setTeamName(''); setTeamDescription(''); setTeamPlaybook(''); onNotice(`${name} saved.`, 'success');
  };
  const toggleMember = (id: string) => {
    const next = teamAgents.includes(id) ? teamAgents.filter(agentId => agentId !== id) : [...teamAgents, id];
    setTeamAgents(next);
  };
  const deleteTeam = (team: SavedTeam) => { setTeamPendingDelete(team); };
  // The team is gone from the list, but the notice carries it back: a delete that can be put
  // back does not need the person to remember what the team was before they press undo.
  const confirmDeleteTeam = () => {
    const team = teamPendingDelete;
    if (!team) return;
    setTeamPendingDelete(null);
    const index = savedTeams.findIndex(candidate => candidate.id === team.id);
    const remaining = savedTeams.filter(item => item.id !== team.id);
    setSavedTeams(remaining);
    if (team.id === activeTeamId) {
      const next = remaining[0];
      if (next) activateTeam(next);
      else { onChooseRoles(); }
    }
    onNotice(`${team.name} deleted.`, 'attention', () => {
      setSavedTeams(current => {
        if (current.some(candidate => candidate.id === team.id)) return current;
        const at = index < 0 ? current.length : Math.min(index, current.length);
        return [...current.slice(0, at), team, ...current.slice(at)];
      });
      if (team.id === activeTeamId) activateTeam(team);
    });
  };
  const sendTeamMessage = () => { const message = chatDraft.trim(); if (!message) return; onMessageTeam(message); setChatDraft(''); };
  return <View style={styles.teamsPage}>
    <View style={styles.teamsIntro}><Text style={styles.collectionBody}>Build reusable agent groups, set their chain of review, and keep their task conversations together.</Text></View>
    <View style={styles.teamTabs} accessibilityRole="tablist">{([{ id: 'hierarchy', label: 'Hierarchy', icon: 'team' }, { id: 'teams', label: 'Teams', icon: 'team' }, { id: 'chat', label: 'Team chat', icon: 'reviews' }] as const).map(tab => <FocusPressable key={tab.id} accessibilityRole="tab" accessibilityState={{ selected: section === tab.id }} accessibilityLabel={`${tab.label} tab`} onPress={() => setSection(tab.id)} style={({ pressed }) => [styles.teamTab, section === tab.id && styles.teamTabActive, pressed && styles.pressed]}><DispatchIcon name={tab.icon} size={15} color={section === tab.id ? colors.lead : colors.textMuted} /><Text style={[styles.teamTabText, section === tab.id && styles.teamTabTextActive]}>{tab.label}</Text></FocusPressable>)}</View>
    {section === 'hierarchy' ? <ScrollView style={styles.teamSectionScroll} contentContainerStyle={styles.teamSectionContent}>
      <View style={styles.teamSectionHeader}><View style={styles.flexOne}><Text style={styles.teamSectionTitle}>Team hierarchy</Text><Text style={styles.teamSectionBody}>Ranks set review authority. Tool access is individually granted and checked for every workspace request.</Text></View><Button label="Manage teams" onPress={() => setSection('teams')} /></View>
      {activeTeam ? <View style={styles.activeTeamPicker}><Text style={styles.fieldLabel}>Configuring</Text><View style={styles.activeTeamPickerRow}>{savedTeams.map(team => <FocusPressable key={team.id} accessibilityRole="radio" accessibilityState={{ checked: activeTeamId === team.id }} onPress={() => activateTeam(team)} style={[styles.teamChip, activeTeamId === team.id && styles.teamChipActive]}><Text style={[styles.teamChipText, activeTeamId === team.id && styles.teamChipTextActive]}>{team.name}</Text></FocusPressable>)}</View></View> : <EmptyState title="No saved team yet" sentence="Create a team from your existing agent profiles to set its hierarchy and permissions." action={<Button label="Create a team" onPress={() => setSection('teams')} />} />}
      {activeTeam && <><View style={styles.hierarchyLegend}><Text style={styles.settingsSectionTitle}>How approval works</Text><Text style={styles.hierarchyLegendBody}>A Lead or Principal with Code + Review capabilities can approve and apply code only when ranked above its author. If no qualified reviewer passes the check, the change waits for you.</Text></View><View style={styles.hierarchyRankGroup}><Text style={styles.hierarchyRankTitle}>Principal and lead · senior reviewers</Text>{members.filter(role => (agentRanks[role.id] ?? 1) >= 4).sort((a, b) => (agentRanks[b.id] ?? 1) - (agentRanks[a.id] ?? 1)).map(role => <HierarchyAgentCard key={role.id} role={role} avatar={agentAvatars[role.id] ?? 1} rank={agentRanks[role.id] ?? 1} permissions={agentPermissions[role.id] ?? defaultAgentPermissions} memory={agentMemory[role.id] ?? ''} setMemory={value => setAgentMemory(role.id, value)} setRank={setAgentRank} setPermission={setAgentPermission} />)}</View><View style={styles.hierarchyRankGroup}><Text style={styles.hierarchyRankTitle}>Specialist and below</Text>{members.filter(role => (agentRanks[role.id] ?? 1) < 4).sort((a, b) => (agentRanks[b.id] ?? 1) - (agentRanks[a.id] ?? 1)).map(role => <HierarchyAgentCard key={role.id} role={role} avatar={agentAvatars[role.id] ?? 1} rank={agentRanks[role.id] ?? 1} permissions={agentPermissions[role.id] ?? defaultAgentPermissions} memory={agentMemory[role.id] ?? ''} setMemory={value => setAgentMemory(role.id, value)} setRank={setAgentRank} setPermission={setAgentPermission} />)}</View>{!members.length && <Text style={styles.teamSectionBody}>This team has no agents. Add existing agent profiles in Teams.</Text>}</>}
    </ScrollView> : section === 'teams' ? <ScrollView style={styles.teamSectionScroll} contentContainerStyle={styles.teamSectionContent}>
      {savedTeams.length ? <View style={styles.teamSectionHeader}><View style={styles.flexOne}><Text style={styles.teamSectionTitle}>Your teams</Text><Text style={styles.teamSectionBody}>Combine existing specialist profiles into reusable teams. The active team is used for new Dispatch runs.</Text></View><Button label="Create team" onPress={() => openEditor()} variant="primary" icon={<DispatchIcon name="plus" size={16} color={colors.page} />} /></View> : null}
      {editorOpen ? <View style={styles.teamEditor}><View style={styles.teamEditorHeader}><Text style={styles.teamSectionTitle}>{editingId ? 'Edit team' : 'New team'}</Text><FocusPressable accessibilityRole="button" accessibilityLabel="Close team editor" onPress={() => { setEditorOpen(false); setEditingId(null); setTeamName(''); }} style={styles.editorClose}><Text style={styles.teamSectionBody}>Close</Text></FocusPressable></View><Text style={styles.fieldLabel}>Team name</Text><TextInput accessibilityLabel="Team name" value={teamName} onChangeText={setTeamName} maxLength={60} placeholder="e.g. Product launch" placeholderTextColor={colors.textMuted} style={styles.teamInput} /><Text style={styles.fieldLabel}>Purpose (optional)</Text><TextInput accessibilityLabel="Team purpose" value={teamDescription} onChangeText={setTeamDescription} maxLength={240} placeholder="What this group is best at" placeholderTextColor={colors.textMuted} style={styles.teamInput} /><Text style={styles.fieldLabel}>Team playbook</Text><TextInput accessibilityLabel="Team playbook" value={teamPlaybook} onChangeText={setTeamPlaybook} maxLength={3000} multiline placeholder="Conventions, handoff preferences, and standards this team should follow" placeholderTextColor={colors.textMuted} style={[styles.teamInput, styles.playbookInput]} /><Text style={styles.teamChatComposerHint}>This guidance is shared with the team planner and agents. It cannot override the task or grant tools.</Text><Text style={styles.fieldLabel}>Choose existing agents</Text>{availableRoles.map((role, index) => <FocusPressable key={role.id} accessibilityRole="checkbox" accessibilityState={{ checked: teamAgents.includes(role.id) }} onPress={() => toggleMember(role.id)} style={({ pressed }) => [styles.teamMemberChoice, teamAgents.includes(role.id) && styles.teamMemberChoiceActive, pressed && styles.pressed]}><AgentAvatar avatarId={agentAvatars[role.id] ?? index + 1} size={34} /><View style={styles.flexOne}><Text style={styles.savedRoleName}>{role.label}</Text><Text style={styles.savedRoleDetail}>{role.detail}</Text></View><View style={[styles.checkbox, teamAgents.includes(role.id) && styles.checkboxSelected]}>{teamAgents.includes(role.id) && <DispatchIcon name="check" size={11} color={colors.leadInk} />}</View></FocusPressable>)}<Button label={editingId ? 'Save changes' : 'Create team'} onPress={saveTeam} variant="primary" /></View> : null}
      {savedTeams.length ? savedTeams.map(team => <View key={team.id} style={[styles.teamSavedCard, team.id === activeTeamId && styles.teamSavedCardActive]}><View style={styles.teamSavedHead}><View style={styles.savedTeamIcon}><DispatchIcon name="team" size={18} color={colors.lead} /></View><View style={styles.flexOne}><Text style={styles.savedTeamName}>{team.name}</Text><Text style={styles.savedTeamMeta}>{team.agentIds.length} agents · {team.description || 'No team purpose set'}</Text></View>{team.id === activeTeamId && <Chip label="Active" />}</View><View style={styles.teamAvatarRow}>{team.agentIds.map((id, index) => { const role = availableRoles.find(item => item.id === id); return role ? <View key={id} style={styles.teamAvatarItem}><AgentAvatar avatarId={agentAvatars[id] ?? index + 1} size={31} /><Text style={styles.teamAvatarLabel}>{role.label}</Text></View> : null; })}</View><View style={styles.teamCardActions}><Button label={team.id === activeTeamId ? 'Selected' : 'Use team'} onPress={() => { activateTeam(team); if (team.id !== activeTeamId) onNotice(`${team.name} is now active for new runs.`, 'success'); }} disabled={team.id === activeTeamId} variant="ghost" /><Button label="Edit agents" onPress={() => openEditor(team)} variant="ghost" /><Button label="Delete" onPress={() => deleteTeam(team)} variant="ghost" /></View></View>) : !editorOpen ? <EmptyState title="No teams yet" sentence="Create a team from your existing agents, then choose it for a new run." action={<Button label="Create team" onPress={() => openEditor()} variant="primary" />} /> : null}
    </ScrollView> : <View style={styles.teamChatSection}><View style={styles.teamSectionHeader}><View style={styles.flexOne}><Text style={styles.teamSectionTitle}>{activeTeam?.name ?? 'Team chat'}</Text><Text style={styles.teamSectionBody}>Conversation history, handoffs, and review notes from runs with this team.</Text></View><View style={styles.chatTeamStatus}><Text style={styles.settingsStatus}>{activeTeam ? 'Team active' : 'No team'}</Text></View></View><View style={styles.chatFilterRow}>{([{ id: 'all', label: 'All updates' }, { id: 'handoff', label: 'Handoffs' }, { id: 'review', label: 'Review notes' }] as const).map(filter => <FocusPressable key={filter.id} accessibilityRole="radio" accessibilityState={{ checked: chatFilter === filter.id }} onPress={() => setChatFilter(filter.id)} style={[styles.teamChip, chatFilter === filter.id && styles.teamChipActive]}><Text style={[styles.teamChipText, chatFilter === filter.id && styles.teamChipTextActive]}>{filter.label}</Text></FocusPressable>)}</View><ScrollView style={styles.teamChatHistory} contentContainerStyle={styles.teamChatHistoryContent}>{messages.length ? messages.map(({ run: teamRun, message }) => <View key={`${teamRun.id}-${message.id}`} style={styles.teamChatMessage}><View style={styles.teamChatMessageTop}><Text style={styles.teamChatSender}>{message.from}</Text><Text style={styles.teamChatKind}>{message.kind} · {new Date(message.createdAt).toLocaleTimeString()}</Text></View><Text style={styles.teamChatRunTitle}>{teamRun.brief}</Text><Text style={styles.teamChatMessageText}>{message.text}</Text><Button label="Open run and continue" onPress={() => onOpenRun(teamRun)} variant="ghost" /></View>) : <EmptyState title={activeTeam ? 'No conversations yet' : 'Choose a team to see its conversation'} sentence="Agent discussion and review updates appear here after the team starts a run." />}</ScrollView><View style={styles.teamChatComposer}><TextInput accessibilityLabel="Message or task for the active team" value={chatDraft} onChangeText={setChatDraft} multiline maxLength={12000} placeholder={activeTeam ? `Give ${activeTeam.name} a task or question…` : 'Create or choose a team first'} placeholderTextColor={colors.textMuted} editable={!!activeTeam} style={styles.teamChatInput} /><Button label="Continue in Dispatch" onPress={sendTeamMessage} variant="primary" disabled={!activeTeam || !chatDraft.trim()} /><Text style={styles.teamChatComposerHint}>Your message opens Dispatch with this team selected, where you can review the plan before it runs.</Text></View></View>}
    <ConfirmDialog visible={!!teamPendingDelete} title={`Delete ${teamPendingDelete?.name ?? 'this team'}?`} body="The team is removed from your saved teams. Runs that used it keep their record, and the notice can put the team back." confirmLabel="Delete team" onConfirm={confirmDeleteTeam} onCancel={() => setTeamPendingDelete(null)} />
  </View>;
});

export { TeamsHomeImpl as TeamsHome };
