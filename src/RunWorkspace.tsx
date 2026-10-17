import React, { useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Run } from './orchestration/types';
import { diffLines } from './orchestration/diffLines';
import { steerActiveRun } from './orchestration/model-runner';
import { colors, typography } from './theme';

type RunChangeAction = (run: Run, changeId: string) => void | Promise<void>;
type ArtifactAction = (run: Run, artifactId: string) => void;

export function RunRoom({ run, busy, onPause, onResume, onResults, onUpdate }: {
  run: Run | null;
  busy: boolean;
  onPause: () => void;
  onResume: () => void;
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
        ? <ActionButton label="Resume run" onPress={onResume} /> : null}
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
        placeholderTextColor={colors.muted}
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

export function ResultsStudio({ run, history, onApply, onReject, onAcceptArtifact, onSaveRecipe, onUndo, onOpenRun }: {
  run: Run | null;
  history: Run[];
  onApply: RunChangeAction;
  onReject: RunChangeAction;
  onAcceptArtifact: ArtifactAction;
  onSaveRecipe: (run: Run) => void;
  onUndo: RunChangeAction;
  onOpenRun: (run: Run) => void;
}) {
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
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
    <View style={styles.row}>
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
        const canApply = !change.appliedAt && !change.rejectedAt && !change.revertedAt && !change.supersededAt;
        const canReject = !change.appliedAt && !change.revertedAt && !change.supersededAt && !change.rejectedAt;
        const diff = diffLines(change.before, change.after);
        const diffLabel = diff.identical
          ? 'NO CHANGES'
          : change.createOnly || !change.before ? `NEW FILE · +${diff.added}` : `DIFF · +${diff.added} -${diff.removed}`;
        return <View key={change.id} style={styles.card}>
          <Text style={styles.name}>{change.path} · revision {change.attempt} · {change.createdBy}</Text>
          <ScrollView horizontal>
            <View>
              <Text style={styles.diffLabel}>{diffLabel}</Text>
              {diff.identical
                ? <Text style={styles.code}>Contents already match.</Text>
                : diff.lines.map((line, index) => <Text key={index} selectable style={[line.kind === 'meta' ? styles.dim : null, styles.code]}>
                  {{ add: '+ ', remove: '- ', context: '  ', meta: '' }[line.kind]}{line.text}
                </Text>)}
            </View>
          </ScrollView>
          <View style={styles.actions}>
            {change.appliedAt && !change.revertedAt
              ? <ActionButton label="Undo applied change" onPress={() => onUndo(activeRun, change.id)} />
              : change.revertedAt ? <Text style={styles.badge}>REVERTED</Text>
                : <ActionButton label="Apply selected change" disabled={!canApply} onPress={() => onApply(activeRun, change.id)} />}
            {canReject ? <ActionButton label="Reject" onPress={() => onReject(activeRun, change.id)} /> : null}
            {change.rejectedAt ? <Text style={styles.badge}>REJECTED</Text> : null}
            {change.supersededAt ? <Text style={styles.badge}>SUPERSEDED</Text> : null}
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
        • {item.title} — {item.status} ({activeRun.agentProfiles?.find(agent => agent.id === item.agentId)?.name ?? item.agentId})
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

function ActionButton({ label, onPress, disabled = false, active = false }: { label: string; onPress: () => void; disabled?: boolean; active?: boolean }) {
  return <Pressable
    accessibilityRole="button"
    accessibilityState={{ disabled, selected: active }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.button, active && styles.buttonActive, disabled && styles.buttonDisabled, pressed && !disabled && styles.buttonPressed]}
  >
    <Text style={[styles.buttonText, disabled && styles.dim]}>{label}</Text>
  </Pressable>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 24, gap: 14 },
  kicker: { color: colors.accent, fontFamily: typography.body, fontSize: 11, fontWeight: '700', letterSpacing: 1.2 },
  title: { color: colors.ink, fontFamily: typography.display, fontSize: 29, fontWeight: '700' },
  dim: { color: colors.muted, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  button: { backgroundColor: '#293B36', borderColor: '#40534C', borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 13 },
  buttonActive: { backgroundColor: '#1C302D', borderColor: colors.accent },
  buttonDisabled: { opacity: 0.48 },
  buttonPressed: { opacity: 0.78 },
  buttonText: { color: colors.ink, fontFamily: typography.body, fontSize: 12, fontWeight: '600' },
  metric: { color: colors.accent, fontFamily: typography.body, fontSize: 12, fontWeight: '700' },
  section: { marginTop: 12, color: colors.ink, fontFamily: typography.display, fontSize: 18, fontWeight: '700' },
  card: { padding: 14, gap: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  name: { color: colors.ink, fontFamily: typography.body, fontSize: 13, fontWeight: '700' },
  body: { color: colors.secondary, fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  badge: { color: colors.accent, fontFamily: typography.body, fontSize: 10, fontWeight: '700' },
  activityText: { color: colors.secondary, fontFamily: typography.body, fontSize: 11, lineHeight: 17, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  input: { minWidth: 280, flex: 1, minHeight: 48, padding: 12, color: colors.ink, backgroundColor: colors.panel, borderColor: colors.border, borderWidth: 1, borderRadius: 8 },
  imageComparison: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  preview: { width: 280, height: 240, resizeMode: 'contain', backgroundColor: colors.panel, borderRadius: 8 },
  diffLabel: { color: colors.accent, fontFamily: typography.body, fontSize: 10, fontWeight: '700', marginTop: 5 },
  code: { color: colors.ink, fontFamily: 'Cascadia Code', fontSize: 11, lineHeight: 16, maxWidth: 850, marginTop: 5 },
  receiptMessage: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, gap: 4 },
});
