import React, { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Run } from './orchestration/types';
import { diffLines } from './orchestration/diffLines';
import { codeApplySecretBlock, steerActiveRun } from './orchestration/model-runner';
import { FocusPressable } from './Reveal';
import { colors, type, typography } from './theme';

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

  if (!run) return <View style={styles.page}><Text style={styles.title}>Run room</Text><Text style={styles.dim}>Start or open a run to see its live room.</Text></View>;

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
      text,
      kind: 'update' as const,
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
  const paused = run.status === 'cancelled';

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>LIVE RUN ROOM · {paused ? 'PAUSED · RESUMABLE' : run.status.toUpperCase()}</Text>
    <Text style={styles.title}>{run.mission?.name ?? 'Team mission'}</Text>
    <Text style={styles.dim}>{run.brief}</Text>
    <View style={styles.row}>
      <Metric>{doneCount}/{run.items.length} tasks done</Metric>
      <Metric>{run.messages.length} team updates</Metric>
      <Metric>{run.artifacts.length} outputs</Metric>
    </View>
    <View style={styles.actions}>
      {busy ? <ActionButton label="Pause run" onPress={onPause} /> : null}
      {!busy && ['queued', 'cancelled', 'failed', 'needs-approval'].includes(run.status)
        ? <ActionButton label="Resume run" onPress={() => onResume(run)} /> : null}
      <ActionButton label="Open results & receipt →" onPress={onResults} />
    </View>

    <Text style={styles.section}>Assignments</Text>
    {run.items.map(item => {
      const agent = run.agentProfiles?.find(candidate => candidate.id === item.agentId);
      const latestMessage = run.messages.filter(message => message.workItemId === item.id).at(-1);
      const dependencyNames = item.dependsOn.map(id => run.items.find(candidate => candidate.id === id)?.title ?? id);
      return <View key={item.id} style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.name}>{agent?.name ?? item.agentId}</Text>
          <Text style={styles.badge}>{item.status.toUpperCase()}</Text>
        </View>
        <Text style={styles.body}>{item.title}</Text>
        <Text style={styles.dim}>{item.kind.toUpperCase()} · {dependencyNames.length ? `Depends on ${dependencyNames.join(', ')}` : 'No dependencies'}</Text>
        {latestMessage ? <Text style={styles.activityText}>{latestMessage.text}</Text> : null}
      </View>;
    })}

    <Text style={styles.section}>Steer the team</Text>
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
      <ActionButton label="Send" disabled={!direction.trim()} onPress={() => { void sendDirection(); }} />
    </View>

    <Text style={styles.section}>Team activity</Text>
    {[...run.messages].reverse().map(message => <View key={message.id} style={styles.card}>
      <Text style={styles.name}>{message.from} → {message.to} · {message.kind}</Text>
      <Text style={styles.body}>{message.text}</Text>
    </View>)}
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

  if (!activeRun) return <View style={styles.page}><Text style={styles.title}>Results & review</Text><Text style={styles.dim}>Completed runs will appear here with their outputs and review notes.</Text></View>;

  return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>RESULTS STUDIO · RUN RECEIPT</Text>
    <Text style={styles.title}>{activeRun.mission?.name ?? 'Run results'}</Text>
    <Text style={styles.dim}>{activeRun.brief}</Text>
    {notice ? <View style={styles.statusNotice}><Text accessibilityRole="alert" style={styles.statusNoticeText}>{notice}</Text>{onDismissNotice ? <ActionButton label="Dismiss notice" onPress={onDismissNotice} /> : null}</View> : null}    <View style={styles.row}>
      <Metric>{activeRun.status.toUpperCase()}</Metric>
      <Metric>{activeRun.items.length} assignments</Metric>
      <Metric>{activeRun.messages.length} messages</Metric>
    </View>
    <View style={styles.actions}>
      {activeRun.status === 'completed' ? <ActionButton label="Save run as workflow" onPress={() => onSaveRecipe(activeRun)} /> : null}
      {history.filter(item => item.id !== activeRun.id).slice(0, 4).map(item =>
        <ActionButton key={item.id} label={`Open ${item.mission?.name ?? 'run'}`} onPress={() => onOpenRun(item)} />)}
    </View>

    {imageVersions.length ? <>
      <Text style={styles.section}>Image versions</Text>
      <View style={styles.imageComparison}>
        {previousImage ? <Image source={{ uri: previousImage.uri }} accessibilityLabel="Previous image version" style={styles.preview} /> : null}
        {selectedImage ? <Image source={{ uri: selectedImage.uri }} accessibilityLabel="Selected image version" style={styles.preview} /> : null}
      </View>
      {imageVersions.map((artifact, index) => <View key={artifact.id} style={styles.rowBetween}>
        <ActionButton label={`${artifact.name} · version ${index + 1}${artifact.supersededAt ? ' · revised' : ''}`} active={artifact.id === selectedImage?.id} onPress={() => setSelectedArtifactId(artifact.id)} />
        <ActionButton label={artifact.acceptedAt ? 'Accepted' : 'Accept'} disabled={!!artifact.acceptedAt} onPress={() => onAcceptArtifact(activeRun, artifact.id)} />
      </View>)}
    </> : null}

    {codeChanges.length ? <>
      <Text style={styles.section}>Code review</Text>
      {codeChanges.map(change => {
        const itemStatus = activeRun.items.find(item => item.id === change.itemId)?.status;
        const secretBlock = codeApplySecretBlock(change);
        const canApply = !!projectRoot && ['done', 'needs-approval'].includes(itemStatus ?? '') && !change.appliedAt && !change.rejectedAt && !change.revertedAt && !change.supersededAt && !secretBlock;
        const applying = applyingChanges.includes(change.id);
        const canReject = !change.appliedAt && !change.revertedAt && !change.supersededAt && !change.rejectedAt;
        const diff = diffLines(change.before, change.after);
        const isNewFile = change.createOnly || !change.before;
        const showFull = fullChangeId === change.id;
        const diffLabel = isNewFile ? `NEW FILE · +${diff.added}` : diff.identical ? 'NO CHANGES' : `DIFF · +${diff.added} -${diff.removed}`;
        return <View key={change.id} style={styles.card}>
          <Text style={styles.name}>{change.path} · revision {change.attempt} · {change.createdBy}</Text>
          <View style={styles.actions}>
            <Text style={styles.diffLabel}>{diffLabel}</Text>
            <ActionButton label={showFull ? 'Hide full contents' : 'Show full contents'} accessibilityLabel={showFull ? 'Hide full contents: the file before and after this change' : 'Show full contents: the file before and after this change'} expanded={showFull} onPress={() => setFullChangeId(showFull ? null : change.id)} />
          </View>
          <ScrollView horizontal>
            <View>
              {diff.identical && !isNewFile
                ? <Text style={styles.code}>Contents already match.</Text>
                : diff.lines.length ? diff.lines.map((line, index) => <View key={index} style={styles.diffRow}>
                  <Text style={styles.lineNumber}>{line.kind === 'add' ? line.newLineNumber : line.kind === 'remove' ? line.oldLineNumber : line.oldLineNumber}</Text>
                  <Text selectable style={[styles.code, line.kind === 'add' && styles.diffAdded, line.kind === 'remove' && styles.diffRemoved, line.kind === 'meta' && styles.dim]}>
                    {{ add: '+ ', remove: '- ', context: '  ', meta: '' }[line.kind]}{line.text}
                  </Text>
                </View>) : <Text style={styles.dim}>Empty file · nothing to preview.</Text>}
            </View>
          </ScrollView>
          {showFull ? <View>
            <Text style={styles.diffLabel}>COMPLETE FILE BEFORE THIS CHANGE</Text>
            <ScrollView horizontal><Text selectable style={styles.code}>{change.before || 'This file does not exist yet.'}</Text></ScrollView>
            <Text style={styles.diffLabel}>COMPLETE FILE AFTER THIS CHANGE</Text>
            <ScrollView horizontal><Text selectable style={styles.code}>{change.after}</Text></ScrollView>
          </View> : null}
          {secretBlock ? <Text style={styles.dim}>{secretBlock}</Text> : null}
          <View style={styles.actions}>
            {change.appliedAt && !change.revertedAt
              ? <ActionButton label="Undo applied change" disabled={!projectRoot} onPress={() => onUndo(activeRun, change.id)} />
              : change.revertedAt ? <Text style={styles.badge}>REVERTED</Text>
                : change.rejectedAt ? <Text style={styles.badge}>REJECTED</Text>
                  : change.supersededAt ? <Text style={styles.badge}>SUPERSEDED</Text>
                    : <ActionButton label={applying ? 'Applying change…' : secretBlock ? 'Blocked for secrets · fix first' : !projectRoot ? 'Choose a project folder' : itemStatus === 'done' || itemStatus === 'needs-approval' ? 'Apply change' : itemStatus === 'cancelled' ? 'Run was cancelled' : itemStatus === 'blocked' ? 'Waiting for its dependencies' : itemStatus === 'failed' ? 'This step failed' : 'Waiting for review'} disabled={!canApply || applying} onPress={() => onApply(activeRun, change.id)} />}
            {canReject ? <ActionButton label="Reject" onPress={() => onReject(activeRun, change.id)} /> : null}
          </View>
        </View>;
      })}
    </> : null}

    <Text style={styles.section}>Review findings</Text>
    {findings.length ? findings.map(message => <View key={message.id} style={styles.card}>
      <Text style={styles.name}>{message.from}</Text>
      <Text style={styles.body}>{message.text}</Text>
    </View>) : <Text style={styles.dim}>No findings were recorded for this run.</Text>}

    <Text style={styles.section}>Run receipt</Text>
    <View style={styles.card}>
      {activeRun.items.map(item => <Text key={item.id} style={styles.body}>
        • {item.title} ({item.status}, {activeRun.agentProfiles?.find(agent => agent.id === item.agentId)?.name ?? item.agentId})
      </Text>)}
      <Text style={styles.dim}>Started {new Date(activeRun.createdAt).toLocaleString()} · Updated {new Date(activeRun.updatedAt).toLocaleString()}</Text>
      {activeRun.messages.map(message => <View key={message.id} style={styles.receiptMessage}>
        <Text style={styles.diffLabel}>{message.from} → {message.to} · {message.kind}</Text>
        <Text style={styles.body}>{message.text}</Text>
      </View>)}
    </View>
  </ScrollView>;
}

function Metric({ children }: React.PropsWithChildren) {
  return <Text style={styles.metric}>{children}</Text>;
}

function ActionButton({ label, accessibilityLabel, onPress, disabled = false, active = false, expanded }: { label: string; accessibilityLabel?: string; onPress: () => void; disabled?: boolean; active?: boolean; expanded?: boolean }) {
  return <FocusPressable
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel ?? label}
    accessibilityState={{ disabled, selected: active, expanded }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.button, active && styles.buttonActive, disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}
  >
    <Text style={[styles.buttonText, disabled && styles.dim]}>{label}</Text>
  </FocusPressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.page },
  content: { padding: 24, gap: 14 },
  kicker: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 29, fontWeight: '700' },
  dim: { ...type.body, color: colors.textMuted },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: { backgroundColor: colors.support, borderColor: colors.line, borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 13 },
  buttonActive: { backgroundColor: colors.support, borderColor: colors.lead },
  buttonDisabled: { opacity: 0.48 },
  buttonPressed: { opacity: 0.78 },
  buttonText: { color: colors.text, fontFamily: typography.body, fontSize: 12, fontWeight: '600' },
  metric: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 12, fontWeight: '700' },
  section: { marginTop: 12, color: colors.text, fontFamily: typography.display, fontSize: 18, fontWeight: '700' },
  card: { padding: 14, gap: 8, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  // The same neutral channel the Dispatch screen uses, because this notice carries successes
  // as well as failures: a successful apply dressed as an error reads as a failure.
  statusNotice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, backgroundColor: colors.attentionSurface, borderWidth: 1, borderColor: colors.line, borderRadius: 8 },
  statusNoticeText: { flex: 1, color: colors.attention, fontFamily: typography.body, fontSize: 12, lineHeight: 18 },
  name: { ...type.body, color: colors.text, fontWeight: '700' },
  body: { ...type.body, color: colors.textQuiet },
  badge: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 11, fontWeight: '700' },
  activityText: { color: colors.textQuiet, fontFamily: typography.body, fontSize: 12, lineHeight: 18, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8 },
  input: { minWidth: 280, flex: 1, minHeight: 48, padding: 12, color: colors.text, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: 8 },
  imageComparison: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  preview: { width: 280, height: 240, resizeMode: 'contain', backgroundColor: colors.surface, borderRadius: 8 },
  diffLabel: { ...type.meta, color: colors.textQuiet, fontWeight: '700', letterSpacing: .6, marginTop: 5 },
  diffRow: { flexDirection: 'row', alignItems: 'flex-start' },
  lineNumber: { ...type.code, width: 32, color: colors.textMuted, marginRight: 8, marginTop: 5 },
  diffAdded: { color: colors.textQuiet },
  diffRemoved: { color: colors.critical },
  code: { ...type.code, color: colors.text, maxWidth: 850, marginTop: 5 },
  receiptMessage: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 8, gap: 4 },
});
