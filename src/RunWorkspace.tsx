import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Run } from './orchestration/types';
import { diffLines } from './orchestration/diffLines';
import { codeApplySecretBlock, steerActiveRun } from './orchestration/model-runner';
import { FocusPressable } from './Reveal';
import { Button, Chip, EmptyState, Section } from './ui';
import { colors, radius, space, type, typography } from './theme';

type RunChangeAction = (run: Run, changeId: string) => void | Promise<void>;
type ArtifactAction = (run: Run, artifactId: string) => void;

export function RunRoom({ run, busy, onPause, onResume, onResults, onUpdate }: {
  run: Run | null;
  busy: boolean;
  onPause: () => void;
  onResume: (run: Run) => void;
  onResults: () => void;
  onUpdate: (run: Run) => void;
}) {
  const [direction, setDirection] = useState('');

  if (!run) {
    return <View style={styles.page}>
      <EmptyState
        title="No active run"
        sentence="Start a run from Dispatch and its live room appears here: the plan, the handoffs and anything that needs you."
      />
    </View>;
  }

  const sendDirection = async () => {
    const text = direction.trim().slice(0, 2000);
    if (!text) return;
    if (await steerActiveRun(run.id, text)) {
      setDirection('');
      return;
    }

    const createdAt = new Date().toISOString();
    const message = {
      id: `msg-${run.messages.length + 1}`,
      runId: run.id,
      from: 'You · run direction',
      to: 'team' as const,
      kind: 'update' as const,
      text,
      createdAt,
    };
    onUpdate({
      ...run,
      messages: [...run.messages, message],
      steeringNotes: [...(run.steeringNotes ?? []), text],
      updatedAt: createdAt,
    });
    setDirection('');
  };

  const doneCount = run.items.filter(item => item.status === 'done').length;

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.title}>{run.mission?.name ?? 'Team mission'}</Text>
    <Text style={styles.dim}>{run.brief}</Text>
    <View style={styles.figureStrip}>
      <Figure value={`${doneCount}/${run.items.length}`} label="tasks done" />
      <Figure value={String(run.messages.length)} label="team updates" />
      <Figure value={String(run.artifacts.length)} label="outputs" />
    </View>
    <View style={styles.actions}>
      {busy ? <Button label="Pause run" onPress={onPause} /> : null}
      {!busy && ['queued', 'cancelled', 'failed', 'needs-approval'].includes(run.status)
        ? <Button label="Resume run" onPress={() => onResume(run)} /> : null}
      <Button label="Open results and receipt" onPress={onResults} variant="ghost" />
    </View>

    <Section title="Assignments" supporting="Who is doing what, and what it depends on.">
      {run.items.map(item => {
        const agent = run.agentProfiles?.find(candidate => candidate.id === item.agentId);
        const latestMessage = run.messages.filter(message => message.workItemId === item.id).at(-1);
        const dependencyNames = item.dependsOn.map(id => run.items.find(candidate => candidate.id === id)?.title ?? id);
        return <View key={item.id} style={styles.itemRow}>
          <View style={styles.itemMain}>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.dim}>{agent?.name ?? item.agentId} · {item.kind} · {dependencyNames.length ? `depends on ${dependencyNames.join(', ')}` : 'no dependencies'}</Text>
            {latestMessage ? <Text style={styles.activityText}>{latestMessage.text}</Text> : null}
          </View>
          <Chip label={item.status} attention={item.status === 'blocked' || item.status === 'failed'} critical={item.status === 'failed'} />
        </View>;
      })}
    </Section>

    <Section title="Steer the team" supporting="Add direction or answer a blocker.">
      <View style={styles.row}>
        <TextInput
          accessibilityLabel="Direction for the agent team"
          value={direction}
          onChangeText={setDirection}
          onSubmitEditing={() => { void sendDirection(); }}
          placeholder="Add direction or answer a blocker…"
          placeholderTextColor={colors.textMuted}
          multiline
          maxLength={2000}
          style={styles.input}
        />
        <Button label="Send" disabled={!direction.trim()} onPress={() => { void sendDirection(); }} />
      </View>
    </Section>

    <Section title="Team activity" supporting="Every handoff, newest first.">
      {[...run.messages].reverse().map(message => <View key={message.id} style={styles.activityRow}>
        <Text style={styles.itemTitle}>{message.from} to {message.to}</Text>
        <Text style={styles.body}>{message.text}</Text>
      </View>)}
    </Section>
  </ScrollView>;
}

export function ResultsStudio({ run, history, projectRoot, applyingChanges = [], notice = '', onDismissNotice, onApply, onReject, onAcceptArtifact, onSaveRecipe, onUndo, onOpenRun }: {
  run: Run | null;
  history: Run[];
  projectRoot: string;
  applyingChanges?: string[];
  notice?: string;
  onDismissNotice?: () => void;
  onApply: RunChangeAction;
  onReject: RunChangeAction;
  onAcceptArtifact: ArtifactAction;
  onSaveRecipe: (run: Run) => void;
  onUndo: RunChangeAction;
  onOpenRun: (run: Run) => void;
}) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [fullChangeId, setFullChangeId] = useState<string | null>(null);
  const activeRun = run ?? history[0] ?? null;
  const imageVersions = useMemo(() => activeRun?.artifacts.filter(artifact => artifact.kind === 'image') ?? [], [activeRun]);
  const foundSelectedIndex = imageVersions.findIndex(artifact => artifact.id === selectedArtifactId);
  const selectedIndex = foundSelectedIndex >= 0 ? foundSelectedIndex : Math.max(0, imageVersions.length - 1);
  const selectedImage = imageVersions[selectedIndex] ?? imageVersions.at(-1);
  const previousImage = imageVersions[Math.max(0, selectedIndex - 1)];
  const codeChanges = activeRun?.changes ?? [];
  const findings = activeRun?.messages.filter(message => message.kind === 'finding') ?? [];

  if (!activeRun) {
    return <View style={styles.page}>
      <EmptyState
        title="No runs yet"
        sentence="A run keeps its plan, its handoffs and its review together. Start one from Dispatch and it appears here."
      />
    </View>;
  }

  const otherRuns = history.filter(item => item.id !== activeRun.id).slice(0, 6);
  const stateLabel: Record<Run['status'], string> = {
    queued: 'Plan ready',
    running: 'In progress',
    reviewing: 'Reviewing',
    completed: 'Complete',
    failed: 'Stopped',
    cancelled: 'Cancelled',
    'needs-approval': 'Needs your review',
  };

  return <View style={styles.reviewLayout}>
    {otherRuns.length ? <View style={styles.runList}>
      <Text style={styles.listTitle}>Earlier runs</Text>
      {otherRuns.map(item => <FocusPressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.mission?.name ?? 'run'}`}
        onPress={() => onOpenRun(item)}
        style={({ pressed }) => [styles.runListItem, pressed && styles.pressed]}
      >
        <Text numberOfLines={1} style={styles.itemTitle}>{item.mission?.name ?? item.brief}</Text>
        <Text style={styles.dim}>{new Date(item.updatedAt).toLocaleString()}</Text>
      </FocusPressable>)}
    </View> : null}

    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{activeRun.mission?.name ?? 'Run results'}</Text>
      <Text style={styles.dim}>{activeRun.brief}</Text>
      {notice ? <View style={styles.statusNotice} accessibilityRole="alert"><Text style={styles.statusNoticeText}>{notice}</Text>{onDismissNotice ? <Button label="Dismiss notice" onPress={onDismissNotice} variant="ghost" /> : null}</View> : null}
      <View style={styles.figureStrip}>
        <Figure value={stateLabel[activeRun.status]} label="state" />
        <Figure value={String(activeRun.items.length)} label="assignments" />
        <Figure value={String(activeRun.messages.length)} label="messages" />
      </View>
      {activeRun.status === 'completed' ? <View style={styles.actions}><Button label="Save run as workflow" onPress={() => onSaveRecipe(activeRun)} /></View> : null}

      {imageVersions.length ? <>
        <Section title="Image versions" supporting="The latest version is on the right.">
          <View style={styles.imageComparison}>
            {previousImage ? <Image source={{ uri: previousImage.uri }} accessibilityLabel="Previous image version" style={styles.preview} /> : null}
            {selectedImage ? <Image source={{ uri: selectedImage.uri }} accessibilityLabel="Selected image version" style={styles.preview} /> : null}
          </View>
          {imageVersions.map((artifact, index) => <View key={artifact.id} style={styles.itemRow}>
            <FocusPressable
              accessibilityRole="button"
              accessibilityLabel={`${artifact.name} · version ${index + 1}${artifact.supersededAt ? ' · revised' : ''}`}
              accessibilityState={{ selected: artifact.id === selectedImage?.id }}
              onPress={() => setSelectedArtifactId(artifact.id)}
              style={({ pressed }) => [styles.itemMain, pressed && styles.pressed]}
            >
              <Text style={styles.itemTitle}>{artifact.name} · version {index + 1}</Text>
              {artifact.supersededAt ? <Text style={styles.dim}>revised</Text> : null}
            </FocusPressable>
            <Button label={artifact.acceptedAt ? 'Accepted' : 'Accept'} disabled={!!artifact.acceptedAt} onPress={() => onAcceptArtifact(activeRun, artifact.id)} />
          </View>)}
        </Section>
      </> : null}

      {codeChanges.length ? <>
        <Section title="Code review" supporting="Each proposal is staged until you apply it.">
          {codeChanges.map(change => {
            const itemStatus = activeRun.items.find(item => item.id === change.itemId)?.status;
            const secretBlock = codeApplySecretBlock(change);
            const canApply = !!projectRoot && ['done', 'needs-approval'].includes(itemStatus ?? '') && !change.appliedAt && !change.rejectedAt && !change.revertedAt && !change.supersededAt && !secretBlock;
            const applying = applyingChanges.includes(change.id);
            const canReject = !change.appliedAt && !change.revertedAt && !change.supersededAt && !change.rejectedAt;
            const diff = diffLines(change.before, change.after);
            const isNewFile = change.createOnly || !change.before;
            const showFull = fullChangeId === change.id;
            const diffLabel = isNewFile ? `New file, ${diff.added} lines added` : diff.identical ? 'No changes' : `${diff.added} added, ${diff.removed} removed`;
            const waitingOnYou = itemStatus === 'needs-approval';
            return <View key={change.id} style={styles.changeCard}>
              <View style={styles.changeHead}>
                <View style={styles.itemMain}>
                  <Text style={styles.path}>{change.path}</Text>
                  <Text style={styles.dim}>revision {change.attempt} · {change.createdBy}</Text>
                </View>
                <Chip
                  label={change.supersededAt ? 'Superseded' : change.revertedAt ? 'Reverted' : change.rejectedAt ? 'Rejected' : change.appliedAt ? 'Applied' : waitingOnYou ? 'Needs review' : 'Proposal'}
                  attention={waitingOnYou}
                  critical={!!(change.rejectedAt || change.revertedAt)}
                />
              </View>
              <View style={styles.changeFoot}>
                <Text style={styles.diffLabel}>{diffLabel}</Text>
                <Button
                  label={showFull ? 'Hide complete contents' : 'Show complete contents'}
                  accessibilityLabel={showFull ? 'Hide complete contents: the file before and after this change' : 'Show complete contents: the file before and after this change'}
                  onPress={() => setFullChangeId(showFull ? null : change.id)}
                  variant="ghost"
                />
              </View>
              <View style={styles.diffBlock}>
                <ScrollView horizontal>
                  <View>
                    {diff.identical && !isNewFile
                      ? <Text style={styles.code}>Contents already match.</Text>
                      : diff.lines.length ? diff.lines.map((line, index) => <View key={index} style={styles.diffRow}>
                        <Text style={styles.lineNumber}>{line.kind === 'add' ? line.newLineNumber : line.kind === 'remove' ? line.oldLineNumber : line.oldLineNumber}</Text>
                        <Text selectable style={[styles.code, line.kind === 'add' && styles.diffAdded, line.kind === 'remove' && styles.diffRemoved, line.kind === 'meta' && styles.dim]}>
                          {{ add: '+ ', remove: '- ', context: '  ', meta: '' }[line.kind]}{line.text}
                        </Text>
                      </View>) : <Text style={styles.dim}>Empty file, nothing to preview.</Text>}
                  </View>
                </ScrollView>
              </View>
              {showFull ? <View>
                <Text style={styles.diffLabel}>Complete file before this change</Text>
                <ScrollView horizontal><Text selectable style={styles.code}>{change.before || 'This file does not exist yet.'}</Text></ScrollView>
                <Text style={styles.diffLabel}>Complete file after this change</Text>
                <ScrollView horizontal><Text selectable style={styles.code}>{change.after}</Text></ScrollView>
              </View> : null}
              {secretBlock ? <Text style={styles.dim}>{secretBlock}</Text> : null}
              <View style={[styles.decisionRow, waitingOnYou && styles.decisionRowWaiting]}>
                {waitingOnYou ? <Text style={styles.decisionText}>This change is waiting for you</Text> : null}
                {change.appliedAt && !change.revertedAt
                  ? <Button label="Undo applied change" disabled={!projectRoot} onPress={() => onUndo(activeRun, change.id)} variant={waitingOnYou ? 'inverse' : 'secondary'} />
                  : change.revertedAt ? <Chip label="Reverted" critical />
                    : change.rejectedAt ? <Chip label="Rejected" critical />
                      : change.supersededAt ? <Chip label="Superseded" critical />
                        : <Button label={applying ? 'Applying change…' : secretBlock ? 'Blocked for secrets · fix first' : !projectRoot ? 'Choose a project folder' : itemStatus === 'done' || itemStatus === 'needs-approval' ? 'Apply change' : itemStatus === 'cancelled' ? 'Run was cancelled' : itemStatus === 'blocked' ? 'Waiting for its dependencies' : itemStatus === 'failed' ? 'This step failed' : 'Waiting for the review that comes next'} disabled={!canApply || applying} onPress={() => onApply(activeRun, change.id)} variant={waitingOnYou ? 'inverse' : 'secondary'} />}
                {canReject ? <Button label="Reject" onPress={() => onReject(activeRun, change.id)} variant="inverse" /> : null}
              </View>
            </View>;
          })}
        </Section>
      </> : null}

      <Section title="Review findings" supporting="What the reviewers said about this run.">
        {findings.length ? findings.map(message => <View key={message.id} style={styles.activityRow}>
          <Text style={styles.itemTitle}>{message.from}</Text>
          <Text style={styles.body}>{message.text}</Text>
        </View>) : <Text style={styles.dim}>No findings were recorded for this run.</Text>}
      </Section>

      <Section title="Run receipt" supporting="What was planned, and what happened.">
        {activeRun.items.map(item => <Text key={item.id} style={styles.body}>
          {item.title} ({item.status}, {activeRun.agentProfiles?.find(agent => agent.id === item.agentId)?.name ?? item.agentId})
        </Text>)}
        <Text style={styles.dim}>Started {new Date(activeRun.createdAt).toLocaleString()} · Updated {new Date(activeRun.updatedAt).toLocaleString()}</Text>
        {activeRun.messages.map(message => <View key={message.id} style={styles.receiptMessage}>
          <Text style={styles.diffLabel}>{message.from} to {message.to} · {message.kind}</Text>
          <Text style={styles.body}>{message.text}</Text>
        </View>)}
      </Section>
    </ScrollView>
  </View>;
}

/**
 * A figure in the strip. The number is monospace and right aligned, so a column of them can
 * be compared without reading the label.
 */
function Figure({ value, label }: { value: string; label: string }) {
  return <View style={styles.figure}>
    <Text style={styles.figureValue}>{value}</Text>
    <Text style={styles.figureLabel}>{label}</Text>
  </View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.xxl, gap: space.lg, maxWidth: 1180, width: '100%', alignSelf: 'center' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 20, fontWeight: '600' },
  dim: { ...type.bodySmall, color: colors.textMuted },
  body: { ...type.body, color: colors.textQuiet },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  pressed: { opacity: 0.82 },

  figureStrip: { flexDirection: 'row', gap: space.xxl, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md },
  figure: { gap: 2 },
  figureValue: { ...type.code, color: colors.text, fontSize: 16, lineHeight: 24 },
  figureLabel: { ...type.meta, color: colors.textMuted },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: space.sm },
  itemMain: { flex: 1, gap: 2 },
  itemTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  activityRow: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: space.sm, gap: 2 },
  activityText: { ...type.bodySmall, color: colors.textQuiet, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, marginTop: space.sm },

  input: { minWidth: 280, flex: 1, minHeight: 44, padding: space.md, color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: radius.control },

  reviewLayout: { flex: 1, flexDirection: 'row', backgroundColor: colors.page },
  runList: { width: 260, borderRightWidth: 1, borderRightColor: colors.line, padding: space.lg, gap: space.sm },
  listTitle: { ...type.label, color: colors.textQuiet },
  runListItem: { paddingVertical: space.sm, gap: 2 },

  statusNotice: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.line, borderRadius: radius.control },
  statusNoticeText: { flex: 1, color: colors.text, ...type.bodySmall },

  imageComparison: { flexDirection: 'row', gap: space.md, flexWrap: 'wrap' },
  preview: { width: 280, height: 240, resizeMode: 'contain', backgroundColor: colors.surface, borderRadius: radius.control },

  changeCard: { padding: space.lg, gap: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card },
  changeHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  changeFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, flexWrap: 'wrap' },
  path: { ...type.code, color: colors.text },
  diffLabel: { ...type.meta, color: colors.textMuted },
  diffBlock: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.control, backgroundColor: colors.page, paddingVertical: space.sm },
  diffRow: { flexDirection: 'row', alignItems: 'flex-start' },
  lineNumber: { ...type.codeSmall, width: 34, color: colors.textMuted, marginRight: space.sm, textAlign: 'right' },
  diffAdded: { color: colors.text },
  diffRemoved: { color: colors.critical },
  code: { ...type.code, color: colors.text },

  // The one lead block on this screen: the change that is waiting for a person.
  decisionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap', padding: space.md, borderRadius: radius.control, backgroundColor: colors.surfaceRaised },
  decisionRowWaiting: { backgroundColor: colors.lead },
  decisionText: { ...type.bodySmall, color: colors.page, fontWeight: '600', marginRight: 'auto' },

  receiptMessage: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, gap: 2 },
  
});
