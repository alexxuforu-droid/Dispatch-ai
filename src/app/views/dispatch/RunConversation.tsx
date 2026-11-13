import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { AgentMessage, Run, WorkItem } from '../../../orchestration/types';
import { FocusPressable } from '../../../Reveal';
import { Button } from '../../../ui';
import { templates } from '../../types';
import { PlanEditor } from './PlanEditor';
import { RichMessage } from '../shared/RichMessage';
import { PlainText } from '../shared/PlainText';
import { styles } from '../styles';

/** The word that names each kind of message in the conversation. */
const messageLabel: Record<AgentMessage['kind'], string> = {
  handoff: 'Handoff',
  question: 'Question',
  finding: 'Review finding',
  update: 'Update',
};

/** The tool audit lines arrive as updates, but they are not an update. */
const TOOL_AUDIT = 'Workspace tool audit for ';

const RunConversationImpl = React.memo(function RunConversation({ run, pendingBrief, busy, onOpenResults, onApprovePlan, onEditPlanTitle, onEditPlanItems = () => undefined }: { run: Run | null; pendingBrief: string; busy: boolean; onOpenResults: () => void; onApprovePlan: () => void; onEditPlanTitle: (itemId: string, title: string) => void; onEditPlanItems?: (items: WorkItem[]) => void }) {
  const [editedTitles, setEditedTitles] = useState<Record<string, string>>(() => Object.fromEntries((run?.items ?? []).map(item => [item.id, item.title])));
  const [planEditorOpen, setPlanEditorOpen] = useState(false);
  // The team on this run owns the steps, so the owners are the people on the run. A run
  // without profiles still names its agents on the steps themselves.
  const owners = useMemo(() => {
    if (!run) return [];
    const profiles = (run.agentProfiles ?? []).map(profile => ({ id: profile.id, name: profile.name }));
    if (profiles.length) return profiles;
    const seen = new Set<string>();
    const fromItems: { id: string; name: string }[] = [];
    for (const item of run.items) {
      if (seen.has(item.agentId)) continue;
      seen.add(item.agentId);
      fromItems.push({ id: item.agentId, name: templates.find(role => role.id === item.agentId)?.label ?? item.agentId });
    }
    return fromItems;
  }, [run]);
  if (!run) return <View style={styles.thread}><View style={styles.userMessage}><Text style={styles.threadLabel}>YOU</Text><Text style={styles.userMessageText}>{pendingBrief}</Text></View><View style={styles.planningState}><Text style={styles.planningText}>Dispatch is creating a plan…</Text></View></View>;
  const statusLabel: Record<Run['status'], string> = { queued: 'Plan ready', running: 'In progress', reviewing: 'Reviewing', completed: 'Complete', failed: 'Stopped', cancelled: 'Cancelled', 'needs-approval': 'Needs your review' };
  return <View style={styles.thread}>
    <View style={styles.threadHeader}><View style={[styles.runStatus, run.status === 'completed' && styles.runStatusDone, run.status === 'cancelled' && styles.runStatusCancelled, run.status === 'needs-approval' && styles.runStatusReview]}><Text style={styles.runStatusText}>{statusLabel[run.status]}</Text></View><Button label="Results" onPress={onOpenResults} variant="ghost" /></View>
    <View style={styles.userMessage}><Text style={styles.threadLabel}>Your task</Text><Text style={styles.userMessageText}>{run.brief}</Text></View>
    <View style={styles.planBlock}><Text style={styles.planBlockTitle}>Team plan</Text>{run.items.map((item, index) => {
      const agent = templates.find(role => role.id === item.agentId);
      const modelId = run.agentModelIds ? run.agentModelIds[item.agentId] : undefined;
      const state = item.status === 'done' ? 'Done' : item.status === 'running' ? 'Working' : item.status === 'needs-approval' ? 'Review' : item.status === 'failed' ? 'Stopped' : item.status === 'cancelled' ? 'Cancelled' : item.status === 'blocked' ? 'Waiting' : 'Ready';
      return <View key={item.id} style={styles.planItem}><View style={[styles.planIndex, item.status === 'done' && styles.planIndexDone]}><Text style={[styles.planIndexText, item.status === 'done' && styles.planIndexTextDone]}>{item.status === 'done' ? '✓' : index + 1}</Text></View><View style={styles.flexOne}><TextInput accessibilityLabel={`Plan step ${index + 1}`} editable={run.status === 'queued'} value={editedTitles[item.id] ?? item.title} onChangeText={value => setEditedTitles(current => ({ ...current, [item.id]: value }))} onEndEditing={event => onEditPlanTitle(item.id, event.nativeEvent.text)} style={styles.planTitleInput} maxLength={180} /><Text style={styles.planAgent}>{agent?.label ?? item.agentId} · {item.kind}{item.dependsOn.length ? ` · after ${item.dependsOn.map(id => Number(id.split('-')[1])).join(', ')}` : ''} · {modelId || 'workspace default'}</Text></View><Text style={styles.planState}>{state}</Text></View>;
    })}
      {run.status === 'queued' ? <>
        <FocusPressable accessibilityRole="button" accessibilityLabel="Edit plan owners and dependencies" accessibilityState={{ expanded: planEditorOpen }} onPress={() => setPlanEditorOpen(open => !open)} style={({ pressed }) => [styles.planEditToggle, pressed && styles.pressed]}>
          <Text style={styles.planEditToggleText}>{planEditorOpen ? 'Hide owners and dependencies' : 'Edit owners and dependencies'}</Text>
        </FocusPressable>
        {planEditorOpen ? <PlanEditor items={run.items} owners={owners} onEdit={items => onEditPlanItems(items)} /> : null}
      </> : null}
    </View>
    {run.messages.length ? <View style={styles.conversationBlock}>
      <Text style={styles.conversationTitle}>Team conversation</Text>
      {run.messages.map(message => {
        const audit = message.text.startsWith(TOOL_AUDIT);
        const label = audit ? 'Tool audit' : messageLabel[message.kind];
        return <View key={message.id} style={styles.conversationItem}>
          <View style={styles.conversationHead}><Text style={styles.conversationLabel}>{label}</Text><Text style={styles.conversationMeta}>{message.from}{message.to && message.to !== 'team' ? ` → ${message.to}` : ''}</Text></View>
          {audit ? <PlainText text={message.text} /> : <RichMessage text={message.text} />}
        </View>;
      })}
    </View> : null}
    {run.status === 'queued' ? <View style={styles.planApproval}><View style={styles.flexOne}><Text style={styles.planApprovalTitle}>Review before work starts</Text></View><Button label={busy ? 'Starting…' : 'Approve plan and start'} variant="primary" disabled={busy} onPress={onApprovePlan} icon={<DispatchIcon name="check" size={15} color={colors.buttonPrimaryInk} />} /></View> : null}
    {busy && <View style={styles.planningState}><View style={styles.planningDot} /><Text style={styles.planningText}>The team is coordinating…</Text></View>}
    {run.status === 'needs-approval' && <View style={styles.reviewNotice}><Text style={styles.reviewNoticeTitle}>{run.checkpointPaused ? 'Wave complete · checkpoint reached' : 'Human review required'}</Text></View>}
    {run.status === 'cancelled' && <View style={styles.reviewNotice}><Text style={styles.reviewNoticeTitle}>Run cancelled</Text></View>}
    {['cancelled', 'failed', 'needs-approval'].includes(run.status) && run.items.some(item => item.status !== 'done') ? <View style={styles.planApproval}><View style={styles.flexOne}><Text style={styles.planApprovalTitle}>{run.checkpointPaused ? 'Approve next wave' : run.status === 'needs-approval' ? 'Review findings, then revise' : 'Continue this run'}</Text></View><Button label={busy ? 'Resuming…' : run.checkpointPaused ? 'Approve next wave' : run.status === 'needs-approval' ? 'Revise and continue' : run.status === 'failed' ? 'Retry unfinished work' : 'Resume unfinished work'} variant="primary" disabled={busy} onPress={onApprovePlan} icon={<DispatchIcon name="check" size={15} color={colors.buttonPrimaryInk} />} /></View> : null}
    {run.status === 'completed' && <View style={styles.completeNotice}><DispatchIcon name="check" size={15} color={colors.lead} /></View>}
  </View>;
});

export { RunConversationImpl as RunConversation };
