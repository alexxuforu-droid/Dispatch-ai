import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { DispatchWorkflow } from '../../../persistence/workspace';
import { FocusPressable } from '../../../Reveal';
import { Button, EmptyState } from '../../../ui';
import { workflowStarters } from '../../../missions';
import { NoticeReporter } from '../../controllers/types';
import { SavedTeam } from '../../types';
import { ConfirmDialog } from '../ConfirmDialog';
import { styles } from '../styles';

const WorkflowHomeImpl = React.memo(function WorkflowHome({ workflows, setWorkflows, teams, activeTeamId, onNotice, onLaunch }: { workflows: DispatchWorkflow[]; setWorkflows: React.Dispatch<React.SetStateAction<DispatchWorkflow[]>>; teams: SavedTeam[]; activeTeamId: string; onNotice: NoticeReporter; onLaunch: (workflow: DispatchWorkflow) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [brief, setBrief] = useState('');
  const [teamId, setTeamId] = useState(activeTeamId);
  const [pendingDelete, setPendingDelete] = useState<DispatchWorkflow | null>(null);
  const addWorkflow = () => { const cleanName = name.trim().slice(0, 60); const cleanBrief = brief.trim().slice(0, 12000); if (!cleanName || !cleanBrief) return; setWorkflows(current => [{ id: `workflow-${Date.now().toString(36)}`, name: cleanName, description: description.trim().slice(0, 240), brief: cleanBrief, teamId: teamId || undefined }, ...current].slice(0, 50)); setName(''); setDescription(''); setBrief(''); onNotice(`${cleanName} saved as a workflow.`, 'success'); };
  // The workflow is gone, but the notice carries it back, so a delete that can be undone does
  // not need the person to remember what it was first.
  const confirmDelete = () => {
    const workflow = pendingDelete;
    if (!workflow) return;
    setPendingDelete(null);
    const index = workflows.findIndex(candidate => candidate.id === workflow.id);
    setWorkflows(current => current.filter(item => item.id !== workflow.id));
    onNotice(`${workflow.name} deleted.`, 'attention', () => {
      setWorkflows(current => {
        if (current.some(candidate => candidate.id === workflow.id)) return current;
        const at = index < 0 ? current.length : Math.min(index, current.length);
        return [...current.slice(0, at), workflow, ...current.slice(at)];
      });
    });
  };
  return <><ScrollView contentContainerStyle={styles.settingsPage}><View style={styles.collectionTop}><Text style={styles.collectionBody}>Save a repeatable task with a preferred team. Launching a workflow still opens Dispatch for plan review before work begins.</Text></View><Text style={styles.promptHeading}>Starter shelf</Text><View style={styles.promptRows}>{workflowStarters.map(starter=><FocusPressable key={starter.id} onPress={()=>onLaunch({id:starter.id,name:starter.name,description:starter.description,brief:starter.brief,teamId:activeTeamId,mission:starter.mission})} style={styles.promptCard}><Text style={styles.promptCardTitle}>{starter.name}</Text><Text style={styles.promptCardDetail}>{starter.description}</Text><Text style={styles.promptCardMeta}>{starter.mission.name} · {starter.mission.output}</Text></FocusPressable>)}</View><View style={styles.workflowEditor}><Text style={styles.teamSectionTitle}>Create a workflow</Text><Text style={styles.fieldLabel}>Workflow name</Text><TextInput accessibilityLabel="Workflow name" value={name} onChangeText={setName} maxLength={60} placeholder="e.g. Review a release" placeholderTextColor={colors.textMuted} style={styles.teamInput} /><Text style={styles.fieldLabel}>Short description</Text><TextInput accessibilityLabel="Workflow description" value={description} onChangeText={setDescription} maxLength={240} placeholder="When to use this process" placeholderTextColor={colors.textMuted} style={styles.teamInput} /><Text style={styles.fieldLabel}>Team</Text><View style={styles.activeTeamPickerRow}><FocusPressable accessibilityRole="radio" accessibilityState={{ checked: !teamId }} onPress={() => setTeamId('')} style={[styles.teamChip, !teamId && styles.teamChipActive]}><Text style={[styles.teamChipText, !teamId && styles.teamChipTextActive]}>Current team</Text></FocusPressable>{teams.map(team => <FocusPressable key={team.id} accessibilityRole="radio" accessibilityState={{ checked: teamId === team.id }} onPress={() => setTeamId(team.id)} style={[styles.teamChip, teamId === team.id && styles.teamChipActive]}><Text style={[styles.teamChipText, teamId === team.id && styles.teamChipTextActive]}>{team.name}</Text></FocusPressable>)}</View><Text style={styles.fieldLabel}>Task template</Text><TextInput accessibilityLabel="Workflow task template" value={brief} onChangeText={setBrief} maxLength={12000} multiline textAlignVertical="top" placeholder="Describe the outcome. You can leave project details as instructions to fill in each time." placeholderTextColor={colors.textMuted} style={[styles.teamInput, styles.workflowBrief]} /><Button label="Save workflow" onPress={addWorkflow} variant="primary" disabled={!name.trim() || !brief.trim()} /></View><View style={styles.workflowList}>{workflows.map(workflow => <View key={workflow.id} style={styles.workflowCard}><View style={styles.teamSavedHead}><View style={styles.savedTeamIcon}><DispatchIcon name="runs" size={17} color={colors.lead} /></View><View style={styles.flexOne}><Text style={styles.savedTeamName}>{workflow.name}</Text><Text style={styles.savedTeamMeta}>{workflow.description || teams.find(team => team.id === workflow.teamId)?.name || 'Current team'}</Text></View><Button label="Delete" onPress={() => setPendingDelete(workflow)} variant="ghost" /></View><Text numberOfLines={3} style={styles.workflowTemplate}>{workflow.brief}</Text><Button label="Use workflow in Dispatch" onPress={() => onLaunch(workflow)} icon={<Text style={styles.promptArrow}>↗</Text>} /></View>)}</View>{!workflows.length && <EmptyState title="No workflows saved" sentence="Create one above from a task your team repeats." />}</ScrollView><ConfirmDialog visible={!!pendingDelete} title={`Delete ${pendingDelete?.name ?? 'this workflow'}?`} body="The workflow is removed from your saved workflows. The notice can put it back." confirmLabel="Delete workflow" onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} /></>;
});

export { WorkflowHomeImpl as WorkflowHome };
