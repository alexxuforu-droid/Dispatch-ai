import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Run } from '../../../orchestration/types';
import { FocusPressable } from '../../../Reveal';
import { relativeTime } from '../../../relativeTime';
import { EmptyState } from '../../../ui';
import { styles } from '../styles';

const TaskBoardHomeImpl = React.memo(function TaskBoardHome({ history, onOpenRun }: { history: Run[]; onOpenRun: (run: Run) => void }) {
  const items = history.flatMap(run => run.items.map(item => ({ run, item }))).sort((a, b) => b.run.updatedAt.localeCompare(a.run.updatedAt));
  const statusLabel = (status: string) => ({ ready: 'Ready', running: 'Working', blocked: 'Blocked', done: 'Done', failed: 'Failed', cancelled: 'Cancelled', 'needs-approval': 'Review' }[status] ?? status);
  return <ScrollView contentContainerStyle={styles.settingsPage}><View style={styles.boardSummary}><Text style={styles.boardSummaryText}>{items.filter(entry => entry.item.status === 'running').length} working</Text><Text style={styles.boardSummaryText}>{items.filter(entry => entry.item.status === 'blocked').length} blocked</Text><Text style={styles.boardSummaryText}>{items.filter(entry => entry.item.status === 'done').length} done</Text><Text style={styles.boardSummaryText}>{items.filter(entry => entry.item.status === 'cancelled').length} cancelled</Text></View>{items.length ? items.map(({ run, item }) => { const agent = run.agentProfiles?.find(candidate => candidate.id === item.agentId); return <FocusPressable key={`${run.id}-${item.id}`} accessibilityRole="button" accessibilityLabel={`Open ${run.mission?.name ?? run.brief}. ${item.title}`} onPress={() => onOpenRun(run)} style={({ pressed }) => [styles.boardCard, pressed && styles.pressed]}><View style={styles.boardCardTop}><Text style={styles.boardKind}>{item.kind}</Text><Text style={[styles.boardStatus, item.status === 'running' && styles.boardStatusWorking]}>{statusLabel(item.status)}</Text></View><Text style={styles.boardTaskTitle}>{item.title}</Text><Text style={styles.boardRunTitle}>{run.mission?.name ?? `Run · ${relativeTime(run.createdAt)}`}</Text><View style={styles.boardCardFoot}><Text style={styles.boardOwner}>{agent?.name ?? item.agentId}</Text><Text style={styles.boardDependencies}>{item.dependsOn.length ? `Depends on ${item.dependsOn.map(id => run.items.find(task => task.id === id)?.title ?? id).join(', ')}` : 'No dependencies'}</Text></View></FocusPressable>; }) : <EmptyState title="No tasks on the board" />}</ScrollView>;
});

export { TaskBoardHomeImpl as TaskBoardHome };
