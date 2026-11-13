import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CodeChange, Run, WorkItem } from './orchestration/types';
import { diffLines } from './orchestration/diffLines';
import { codeApplySecretBlock } from './orchestration/review';
import { steerActiveRun } from './orchestration/model-runner';
import { FocusPressable, isEscapeEvent, keyHandlerProps, useInitialFocus } from './Reveal';
import { Button, Chip, CopyButton, EmptyState, Section, Toast } from './ui';
import { saveChangeAs, saveReportAs } from './exporter';
import { relativeTime } from './relativeTime';
import { colors, radius, space, type, typography } from './theme';
import { ConfirmDialog } from './app/views/ConfirmDialog';
import { NoticeReporter } from './app/controllers/types';
import { discardRunHistory, quarantineRunHistory } from './persistence/runStore';

type RunChangeAction = (run: Run, changeId: string) => void | Promise<void>;
type ArtifactAction = (run: Run, artifactId: string) => void;

export function RunsInbox({ runs, selectedRun, busyRunId, onSelectRun, onOpenPlan, onOpenResults, onPause, onResume, onUpdate, onStartRun, onNotice, onHistoryChanged }: {
  runs: Run[];
  selectedRun: Run | null;
  busyRunId: string | null;
  onSelectRun: (run: Run) => void;
  onOpenPlan: (run: Run) => void;
  onOpenResults: (run: Run) => void;
  onPause: () => void;
  onResume: (run: Run) => void;
  onUpdate: (run: Run) => void;
  onStartRun: () => void;
  /** Reports what happened to the saved history, and how serious it is. */
  onNotice?: NoticeReporter;
  /** Empties the runs on screen once the saved history on the device has been dealt with. */
  onHistoryChanged?: () => void;
}) {
  const active = selectedRun && runs.some(run => run.id === selectedRun.id) ? selectedRun : runs[0] ?? null;
  const [discardOpen, setDiscardOpen] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  // The list is the only way back to an old run, so it has to be findable. The search matches
  // the name, the brief and what the agents said, because a person remembers any of the three.
  const [query, setQuery] = useState('');
  const visibleRuns = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return runs;
    return runs.filter(run => {
      const haystack = [run.mission?.name ?? '', run.brief, ...run.messages.map(message => message.text)].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, runs]);
  // A history that cannot be read is still on the device, and it is still in the way. Moving it
  // aside is the repair: every run is copied under its own quarantine key first, so nothing the
  // person ran is destroyed, and the app gets a list it can work with again.
  const repairHistory = async () => {
    setHistoryBusy(true);
    try {
      const moved = await quarantineRunHistory();
      onHistoryChanged?.();
      onNotice?.(`Saved run history was moved aside as ${moved.quarantineKey}. ${moved.runs} saved ${moved.runs === 1 ? 'run is' : 'runs are'} kept there.`, 'attention');
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : 'The saved run history could not be moved aside.', 'critical');
    } finally { setHistoryBusy(false); }
  };
  const discardHistory = async () => {
    setDiscardOpen(false);
    setHistoryBusy(true);
    try {
      await discardRunHistory();
      onHistoryChanged?.();
      onNotice?.('The saved runs were removed from this app. A copy was kept on this device.', 'attention');
    } catch (error) {
      onNotice?.(error instanceof Error ? error.message : 'The saved run history could not be discarded.', 'critical');
    } finally { setHistoryBusy(false); }
  };
  // The history actions sit below the list in both states, because the state that needs them
  // most is the empty one: a history that could not be read shows as no runs at all.
  const historyActions = <View style={styles.inboxNewRun}>
    <Button label="Repair run history" accessibilityLabel="Repair run history" variant="ghost" disabled={historyBusy} onPress={() => { void repairHistory(); }} />
    <Button label="Discard run history" accessibilityLabel="Discard run history" variant="ghost" disabled={historyBusy} onPress={() => setDiscardOpen(true)} />
  </View>;
  const historyDialog = <ConfirmDialog
    visible={discardOpen}
    title="Discard the saved run history?"
    body="The saved runs are removed from this app. A copy is kept on this device, so nothing is destroyed outright."
    confirmLabel="Discard run history"
    onConfirm={() => { void discardHistory(); }}
    onCancel={() => setDiscardOpen(false)}
  />;

  if (!runs.length) {
    return <View style={styles.inboxEmpty}>
      <EmptyState
        title="No runs yet"
        sentence="Start a run and its team conversation will appear here."
        action={<Button label="Start a run" onPress={onStartRun} variant="primary" />}
      />
      {historyActions}
      {historyDialog}
    </View>;
  }

  return <View style={styles.inbox}>
    <View style={styles.inboxList}>
      <View style={styles.inboxListHeader}><Text style={styles.inboxListTitle}>Recent runs</Text><Text style={styles.inboxListCount}>{runs.length}</Text></View>
      <TextInput
        accessibilityLabel="Search runs"
        accessibilityHint="Type part of a run name, its brief or something an agent said."
        value={query}
        onChangeText={setQuery}
        placeholder="Search runs"
        placeholderTextColor={colors.textMuted}
        style={styles.inboxSearch}
      />
      <ScrollView style={styles.inboxListScroll} contentContainerStyle={styles.inboxListContent}>
        {visibleRuns.length ? visibleRuns.map(run => {
          const latest = run.messages.at(-1);
          return <FocusPressable
            key={run.id}
            accessibilityRole="button"
            accessibilityLabel={`Open conversation: ${run.mission?.name ?? run.brief}`}
            accessibilityState={{ selected: active.id === run.id }}
            onPress={() => onSelectRun(run)}
            style={({ pressed }) => [styles.inboxRow, active.id === run.id && styles.inboxRowSelected, pressed && styles.pressed]}
          >
            <View style={styles.inboxRowHead}>
              <Text numberOfLines={1} style={styles.inboxRowTitle}>{run.mission?.name ?? run.brief}</Text>
              <Text style={styles.inboxRowTime}>{relativeTime(run.updatedAt)}</Text>
            </View>
            <Text numberOfLines={1} style={styles.inboxRowPreview}>{latest?.text ?? run.brief}</Text>
            <View style={styles.inboxRowFoot}><Text style={styles.inboxRowStatus}>{run.status.replace('-', ' ')}</Text><Text style={styles.inboxRowMessages}>{run.messages.length} {run.messages.length === 1 ? 'message' : 'messages'}</Text></View>
          </FocusPressable>;
        }) : <EmptyState
          title="No runs match"
          sentence={`Nothing in the ${runs.length} saved ${runs.length === 1 ? 'run' : 'runs'} matches "${query.trim()}".`}
          action={<Button label="Clear the search" onPress={() => setQuery('')} variant="ghost" />}
        />}
      </ScrollView>
      <Button label="New run" onPress={onStartRun} variant="secondary" style={styles.inboxNewRun} />
      {historyActions}
      {historyDialog}
    </View>
    <View style={styles.inboxConversation}>
      <RunRoom
        key={active?.id ?? 'empty'}
        run={active}
        busy={!!active && busyRunId === active.id}
        onPause={onPause}
        onResume={onResume}
        onPlan={onOpenPlan}
        onResults={onOpenResults}
        onUpdate={onUpdate}
      />
    </View>
  </View>;
}

export function RunRoom({ run, busy, onPause, onResume, onPlan, onResults, onUpdate }: {
  run: Run | null;
  busy: boolean;
  onPause: () => void;
  onResume: (run: Run) => void;
  onPlan: (run: Run) => void;
  onResults: (run: Run) => void;
  onUpdate: (run: Run) => void;
}) {
  const [direction, setDirection] = useState('');
  const [newMessages, setNewMessages] = useState(0);
  const list = useRef<ScrollView>(null);
  const localMessageSequence = useRef(0);
  const atBottom = useRef(true);
  const previous = useRef({ runId: run?.id ?? null, count: run?.messages.length ?? 0 });

  useEffect(() => {
    const runId = run?.id ?? null;
    const count = run?.messages.length ?? 0;
    if (previous.current.runId !== runId) {
      previous.current = { runId, count };
      atBottom.current = true;
      setNewMessages(0);
      return;
    }
    const added = count - previous.current.count;
    previous.current = { runId, count };
    if (added > 0 && !atBottom.current) setNewMessages(current => current + added);
  }, [run?.id, run?.messages.length]);

  if (!run) {
    return <View style={styles.chatEmpty}>
      <EmptyState
        title="Choose a run"
        sentence="Select a conversation from the list to read the team's messages."
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
      id: `local-${run.id}-${run.messages.length + ++localMessageSequence.current}`,
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

  const statusLabel: Record<Run['status'], string> = {
    queued: 'Plan ready', running: 'In progress', reviewing: 'Reviewing', completed: 'Complete',
    failed: 'Stopped', cancelled: 'Cancelled', 'needs-approval': 'Needs your review',
  };
  const handleScroll = (event: { nativeEvent: { contentOffset: { y: number }; layoutMeasurement: { height: number }; contentSize: { height: number } } }) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 64;
    if (atBottom.current) setNewMessages(0);
  };

  return <View style={styles.chatRoom}>
    <View style={styles.chatHeader}>
      <View style={styles.chatHeading}>
        <Text numberOfLines={1} style={styles.chatTitle}>{run.mission?.name ?? 'Run conversation'}</Text>
        <Text numberOfLines={1} style={styles.chatBrief}>{run.brief}</Text>
      </View>
      <View style={styles.chatActions}>
        {busy ? <Button label="Stop run" onPress={onPause} variant="critical" /> : ['queued', 'cancelled', 'failed', 'needs-approval'].includes(run.status) ? <Button label={run.status === 'queued' ? 'Start run' : 'Resume run'} onPress={() => onResume(run)} variant="secondary" /> : null}
        <Button label="Plan" onPress={() => onPlan(run)} variant="ghost" />
        <Button label="Results" onPress={() => onResults(run)} variant="ghost" />
      </View>
    </View>
    <ScrollView
      ref={list}
      testID="run-chat-thread"
      style={styles.chatMessages}
      contentContainerStyle={styles.chatMessageList}
      onScroll={handleScroll}
      scrollEventThrottle={50}
      onContentSizeChange={() => { if (atBottom.current) list.current?.scrollToEnd({ animated: true }); }}
    >
      {run.messages.length ? run.messages.map(message => <View key={message.id} style={[styles.chatMessage, message.from.startsWith('You') && styles.chatMessageSelf]}>
        <View style={styles.chatMessageHead}><Text style={styles.chatSender}>{message.from}</Text><Text style={styles.chatMessageMeta}>{message.to === 'team' ? 'to team' : `to ${message.to}`} · {message.kind} · {new Date(message.createdAt).toLocaleTimeString()}</Text></View>
        <Text style={styles.chatMessageText}>{message.text}</Text>
      </View>) : <EmptyState title="No messages yet" sentence="Team handoffs and updates will appear here as this run progresses." />}
    </ScrollView>
    {newMessages > 0 ? <FocusPressable accessibilityRole="button" accessibilityLabel={`${newMessages} new ${newMessages === 1 ? 'message' : 'messages'}. Jump to latest`} onPress={() => { list.current?.scrollToEnd({ animated: true }); atBottom.current = true; setNewMessages(0); }} style={styles.newMessagesButton}><Text style={styles.newMessagesText}>{newMessages} new {newMessages === 1 ? 'message' : 'messages'} · Jump to latest</Text></FocusPressable> : null}
    {busy ? <View style={styles.chatComposer}>
      <TextInput
        accessibilityLabel="Message the active agent team"
        value={direction}
        onChangeText={setDirection}
        onSubmitEditing={() => { void sendDirection(); }}
        placeholder="Write a message…"
        placeholderTextColor={colors.textMuted}
        multiline
        maxLength={2000}
        style={styles.input}
      />
      <Button label="Send" disabled={!direction.trim()} onPress={() => { void sendDirection(); }} />
    </View> : null}
    <Text style={styles.chatStatus}>{busy ? 'The team is working through this run.' : run.status === 'completed' ? 'This run is complete. Start a new run to message the team.' : `${statusLabel[run.status]}. Resume the run to send a message.`}</Text>
  </View>;
}

/** The label every run state carries on screen. */
const RUN_STATE_LABEL: Record<Run['status'], string> = {
  queued: 'Plan ready', running: 'In progress', reviewing: 'Reviewing', completed: 'Complete',
  failed: 'Stopped', cancelled: 'Cancelled', 'needs-approval': 'Needs your review',
};

/** One measured point in a run-to-run comparison. */
export type RunComparisonRow = { key: string; label: string; left: string; right: string; differs: boolean };
/** One work item, matched by id across the two runs. */
export type RunComparisonItem = { id: string; title: string; leftStatus: WorkItem['status'] | null; rightStatus: WorkItem['status'] | null; differs: boolean };
/** One changed file, matched by path across the two runs. */
export type RunComparisonFile = { path: string; left: { added: number; removed: number } | null; right: { added: number; removed: number } | null; differs: boolean };
/** One review finding, with the reviewer that wrote it. */
export type RunComparisonFinding = { from: string; text: string };

/** Everything a comparison of two runs says. The screen renders this and works out nothing itself. */
export type RunComparison = {
  rows: RunComparisonRow[];
  items: RunComparisonItem[];
  files: RunComparisonFile[];
  findings: { left: RunComparisonFinding[]; right: RunComparisonFinding[]; differs: boolean };
  artifacts: { left: string[]; right: string[]; differs: boolean };
  /** Whether anything measured differs. */
  differs: boolean;
};

/**
 * Compares two saved runs.
 *
 * This is the whole comparison, as data: status, how long each run took and which came
 * first, the work-item statuses, the files each run changed with their line counts, the
 * artifacts and the review findings. It is pure, so what differs can be tested without a
 * renderer, and the screen has one source of truth for "these two are not the same".
 */
export function compareRuns(left: Run, right: Run): RunComparison {
  const itemIds = Array.from(new Set([...left.items.map(item => item.id), ...right.items.map(item => item.id)]));
  const items: RunComparisonItem[] = itemIds.map(id => {
    const leftItem = left.items.find(item => item.id === id);
    const rightItem = right.items.find(item => item.id === id);
    const leftStatus = leftItem?.status ?? null;
    const rightStatus = rightItem?.status ?? null;
    return { id, title: leftItem?.title ?? rightItem?.title ?? id, leftStatus, rightStatus, differs: leftStatus !== rightStatus };
  });

  const statusCounts = (run: Run) => {
    const tally: Record<string, number> = {};
    run.items.forEach(item => { tally[item.status] = (tally[item.status] ?? 0) + 1; });
    return tally;
  };
  const leftCounts = statusCounts(left);
  const rightCounts = statusCounts(right);
  const statuses = Array.from(new Set([...Object.keys(leftCounts), ...Object.keys(rightCounts)])).sort();
  const countText = (tally: Record<string, number>) => statuses.map(status => `${status} ${tally[status] ?? 0}`).join(' · ') || 'no work items';

  // The newest proposal for a path is the one that describes the file as it now stands.
  const fileTally = (run: Run) => {
    const tally = new Map<string, { attempt: number; added: number; removed: number }>();
    (run.changes ?? []).forEach(change => {
      const diff = diffLines(change.before, change.after);
      const seen = tally.get(change.path);
      if (!seen || change.attempt >= seen.attempt) tally.set(change.path, { attempt: change.attempt, added: diff.added, removed: diff.removed });
    });
    return tally;
  };
  const leftFiles = fileTally(left);
  const rightFiles = fileTally(right);
  const paths = Array.from(new Set([...leftFiles.keys(), ...rightFiles.keys()])).sort();
  const files: RunComparisonFile[] = paths.map(path => {
    const leftFile = leftFiles.get(path) ?? null;
    const rightFile = rightFiles.get(path) ?? null;
    const differs = !leftFile || !rightFile || leftFile.added !== rightFile.added || leftFile.removed !== rightFile.removed;
    return { path, left: leftFile ? { added: leftFile.added, removed: leftFile.removed } : null, right: rightFile ? { added: rightFile.added, removed: rightFile.removed } : null, differs };
  });

  const findingList = (run: Run): RunComparisonFinding[] => run.messages.filter(message => message.kind === 'finding').map(message => ({ from: message.from, text: message.text }));
  const leftFindings = findingList(left);
  const rightFindings = findingList(right);
  const findings = { left: leftFindings, right: rightFindings, differs: JSON.stringify(leftFindings) !== JSON.stringify(rightFindings) };

  const artifactList = (run: Run) => run.artifacts.map(artifact => `${artifact.kind}: ${artifact.name}`);
  const leftArtifacts = artifactList(left);
  const rightArtifacts = artifactList(right);
  const artifacts = { left: leftArtifacts, right: rightArtifacts, differs: JSON.stringify(leftArtifacts) !== JSON.stringify(rightArtifacts) };

  const leftDuration = runDurationMs(left);
  const rightDuration = runDurationMs(right);
  const order = runOrder(left, right);

  const rows: RunComparisonRow[] = [
    { key: 'status', label: 'Status', left: RUN_STATE_LABEL[left.status], right: RUN_STATE_LABEL[right.status], differs: left.status !== right.status },
    { key: 'duration', label: 'Duration', left: formatDuration(leftDuration), right: formatDuration(rightDuration), differs: leftDuration !== rightDuration },
    { key: 'order', label: 'Order (by start)', left: order === 'earlier' ? 'earlier run' : order === 'later' ? 'later run' : 'same time', right: order === 'earlier' ? 'later run' : order === 'later' ? 'earlier run' : 'same time', differs: order !== 'same' },
    { key: 'items', label: 'Work items', left: `${left.items.length} total · ${countText(leftCounts)}`, right: `${right.items.length} total · ${countText(rightCounts)}`, differs: items.some(item => item.differs) },
    { key: 'files', label: 'Changed files', left: fileSummary(leftFiles), right: fileSummary(rightFiles), differs: files.some(file => file.differs) },
    { key: 'artifacts', label: 'Artifacts', left: artifactSummary(leftArtifacts), right: artifactSummary(rightArtifacts), differs: artifacts.differs },
    { key: 'findings', label: 'Review findings', left: findingSummary(leftFindings), right: findingSummary(rightFindings), differs: findings.differs },
  ];

  return { rows, items, files, findings, artifacts, differs: rows.some(row => row.differs) };
}

/** How long a run was open, from its first record to its last. */
function runDurationMs(run: Run): number {
  const start = Date.parse(run.createdAt);
  const end = Date.parse(run.updatedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start);
}

/** A duration in the words a person would use. */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return 'under a second';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

/** Which of the two runs started first. */
function runOrder(left: Run, right: Run): 'earlier' | 'later' | 'same' {
  const leftStart = Date.parse(left.createdAt);
  const rightStart = Date.parse(right.createdAt);
  if (!Number.isFinite(leftStart) || !Number.isFinite(rightStart)) return 'same';
  if (leftStart < rightStart) return 'earlier';
  if (leftStart > rightStart) return 'later';
  return 'same';
}

/** One line for the files a run changed. */
function fileSummary(tally: Map<string, { added: number; removed: number }>): string {
  if (!tally.size) return 'no files changed';
  let added = 0;
  let removed = 0;
  tally.forEach(value => { added += value.added; removed += value.removed; });
  return `${tally.size} file${tally.size === 1 ? '' : 's'} · +${added} -${removed}`;
}

/** One line for the artifacts a run produced. */
function artifactSummary(artifacts: string[]): string {
  return artifacts.length ? `${artifacts.length} · ${artifacts.join(', ')}` : 'no artifacts';
}

/** One line for the review findings a run recorded. */
function findingSummary(findings: RunComparisonFinding[]): string {
  return findings.length ? `${findings.length} finding${findings.length === 1 ? '' : 's'}` : 'no findings';
}

/** The name a run is known by on screen. */
function runName(run: Run): string {
  return run.mission?.name ?? run.brief;
}

/** The file name an exported change is offered under. */
function suggestedFileName(path: string, fallback: string): string {
  const name = path.split(/[\\/]/).filter(Boolean).pop();
  return name || fallback;
}

/** The review evidence of a run, as the text that is written out. */
function buildReviewReport(run: Run): string {
  const findings = run.messages.filter(message => message.kind === 'finding');
  return [
    `Review report: ${runName(run)}`,
    `Run: ${run.id}`,
    `Status: ${RUN_STATE_LABEL[run.status]}`,
    `Started: ${new Date(run.createdAt).toLocaleString()}`,
    `Updated: ${new Date(run.updatedAt).toLocaleString()}`,
    '',
    'Review findings',
    findings.length
      ? findings.map((message, index) => `${index + 1}. ${message.from}: ${message.text}`).join('\n')
      : 'No findings were recorded for this run.',
    '',
    'Work items',
    run.items.length
      ? run.items.map(item => `- ${item.title} (${item.status}, ${run.agentProfiles?.find(agent => agent.id === item.agentId)?.name ?? item.agentId})`).join('\n')
      : 'No work items were recorded for this run.',
  ].join('\n');
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
  const [hoveredRun, setHoveredRun] = useState<string | null>(null);
  const [fullChangeId, setFullChangeId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareLeftId, setCompareLeftId] = useState<string | null>(null);
  const [compareRightId, setCompareRightId] = useState<string | null>(null);
  const [rejectingChangeId, setRejectingChangeId] = useState<string | null>(null);
  const [undoneChangeId, setUndoneChangeId] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<{ tone: 'success' | 'critical'; title: string; body?: string } | null>(null);
  const activeRun = run ?? history[0] ?? null;
  const imageVersions = useMemo(() => activeRun?.artifacts.filter(artifact => artifact.kind === 'image') ?? [], [activeRun]);
  const foundSelectedIndex = imageVersions.findIndex(artifact => artifact.id === selectedArtifactId);
  const selectedIndex = foundSelectedIndex >= 0 ? foundSelectedIndex : Math.max(0, imageVersions.length - 1);
  const selectedImage = imageVersions[selectedIndex];
  const previousImage = selectedIndex > 0 ? imageVersions[selectedIndex - 1] : undefined;
  const codeChanges = activeRun?.changes ?? [];
  const findings = activeRun?.messages.filter(message => message.kind === 'finding') ?? [];
  // The dialog takes the focus when it opens, and the disclosure takes it when it expands.
  const dialogFocus = useInitialFocus<View>(!!rejectingChangeId);
  const disclosureFocus = useInitialFocus<View>(!!fullChangeId);

  if (!activeRun) {
    return <View style={styles.page}>
      <EmptyState
        title="No runs yet"
        sentence="A run keeps its plan, its handoffs and its review together. Start one from Dispatch and it appears here."
      />
    </View>;
  }

  // Every saved run the person can compare: the one on screen first, then the history.
  const candidates: Run[] = [];
  for (const item of [activeRun, ...history]) {
    if (item && !candidates.some(candidate => candidate.id === item.id)) candidates.push(item);
  }
  const otherRuns = candidates.filter(item => item.id !== activeRun.id).slice(0, 6);
  const compareCandidates = [activeRun, ...otherRuns];
  const leftRun = compareCandidates.find(item => item.id === compareLeftId) ?? activeRun;
  const rightRun = compareCandidates.find(item => item.id === compareRightId) ?? compareCandidates.find(item => item.id !== activeRun.id) ?? activeRun;
  const comparison = compareMode ? compareRuns(leftRun, rightRun) : null;
  const rejectingChange = rejectingChangeId ? codeChanges.find(change => change.id === rejectingChangeId) : undefined;
  // The undo notice only appears once the run itself records the undo, so it never claims a
  // file was put back when the write was refused.
  const undoneChange = undoneChangeId ? codeChanges.find(change => change.id === undoneChangeId && change.revertedAt) : undefined;
  const noticeBlock = notice ? <View style={styles.statusNotice} accessibilityRole="alert"><Text style={styles.statusNoticeText}>{notice}</Text>{onDismissNotice ? <Button label="Dismiss notice" onPress={onDismissNotice} variant="ghost" /> : null}</View> : null;

  const saveChange = async (change: CodeChange) => {
    try {
      const saved = await saveChangeAs(change.after, suggestedFileName(change.path, 'change.txt'));
      // A cancelled dialog means the person changed their mind, not that something failed.
      if (!saved) return;
      setExportNotice({ tone: 'success', title: `Saved ${change.path}`, body: saved });
    } catch (error) {
      setExportNotice({ tone: 'critical', title: `Could not save ${change.path}`, body: error instanceof Error ? error.message : String(error) });
    }
  };

  const saveReview = async () => {
    try {
      const saved = await saveReportAs(buildReviewReport(activeRun), `review-${suggestedFileName(runName(activeRun), 'run').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`);
      if (!saved) return;
      setExportNotice({ tone: 'success', title: 'Saved the review', body: saved });
    } catch (error) {
      setExportNotice({ tone: 'critical', title: 'Could not save the review', body: error instanceof Error ? error.message : String(error) });
    }
  };

  const restoreChange = (changeId: string) => {
    const change = codeChanges.find(candidate => candidate.id === changeId);
    if (!change) return;
    // The app refuses a change that still carries its applied or reverted stamp, so the
    // restore is offered as the fresh proposal it now is: the same contents, no stamps.
    const restored: Run = { ...activeRun, changes: codeChanges.map(candidate => candidate.id === changeId ? { ...candidate, appliedAt: undefined, revertedAt: undefined } : candidate) };
    setUndoneChangeId(null);
    void onApply(restored, changeId);
  };

  return <View style={styles.reviewLayout}>
    {otherRuns.length ? <View style={[styles.runList, compareMode && styles.runListCompare]}>
      <View style={styles.runListHead}>
        <Text style={styles.listTitle}>{compareMode ? 'Compare runs' : 'Earlier runs'}</Text>
        <Button
          label={compareMode ? 'Close comparison' : 'Compare'}
          variant="ghost"
          accessibilityLabel={compareMode ? 'Leave comparison mode' : 'Compare two saved runs side by side'}
          onPress={() => {
            if (compareMode) { setCompareMode(false); return; }
            setCompareMode(true);
            setCompareLeftId(activeRun.id);
            setCompareRightId(otherRuns[0]?.id ?? null);
          }}
        />
      </View>
      {compareMode ? <Text style={styles.dim}>Pick run A and run B. The panel beside this list shows them side by side.</Text> : null}
      {compareMode ? compareCandidates.map(item => <View key={item.id} style={styles.runListItem}>
        <Text numberOfLines={1} style={styles.itemTitle}>{runName(item)}</Text>
        <View style={styles.compareSlots}>
          <FocusPressable
            accessibilityRole="radio"
            accessibilityLabel={`Compare ${runName(item)} as run A`}
            accessibilityState={{ checked: compareLeftId === item.id }}
            onPress={() => setCompareLeftId(item.id)}
            style={[styles.slotButton, compareLeftId === item.id && styles.slotButtonActive]}
          >
            <Text style={[styles.slotText, compareLeftId === item.id && styles.slotTextActive]}>A</Text>
          </FocusPressable>
          <FocusPressable
            accessibilityRole="radio"
            accessibilityLabel={`Compare ${runName(item)} as run B`}
            accessibilityState={{ checked: compareRightId === item.id }}
            onPress={() => setCompareRightId(item.id)}
            style={[styles.slotButton, compareRightId === item.id && styles.slotButtonActive]}
          >
            <Text style={[styles.slotText, compareRightId === item.id && styles.slotTextActive]}>B</Text>
          </FocusPressable>
        </View>
      </View>) : otherRuns.map(item => <FocusPressable
        key={item.id}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.mission?.name ?? 'run'}`}
        onPress={() => onOpenRun(item)}
        onHoverIn={() => setHoveredRun(item.id)}
        onHoverOut={() => setHoveredRun(current => current === item.id ? null : current)}
        style={({ pressed }) => [styles.runListItem, pressed && styles.pressed]}
      >
        <Text numberOfLines={1} style={styles.itemTitle}>{item.mission?.name ?? item.brief}</Text>
        <Text style={styles.dim} accessibilityLabel={`Updated ${new Date(item.updatedAt).toLocaleString()}`}>{hoveredRun === item.id ? new Date(item.updatedAt).toLocaleString() : relativeTime(item.updatedAt)}</Text>
      </FocusPressable>)}
    </View> : null}

    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      {comparison ? <><ComparisonPanel comparison={comparison} left={leftRun} right={rightRun} />{noticeBlock}</> : <>
        <Text style={styles.title}>{activeRun.mission?.name ?? 'Run results'}</Text>
        <Text style={styles.dim}>{activeRun.brief}</Text>
        {noticeBlock}
        <View style={styles.figureStrip}>
          <Figure value={RUN_STATE_LABEL[activeRun.status]} label="state" />
          <Figure value={String(activeRun.items.length)} label="assignments" />
          <Figure value={String(activeRun.messages.length)} label="messages" />
        </View>
        {activeRun.status === 'completed' ? <View style={styles.actions}><Button label="Save run as workflow" onPress={() => onSaveRecipe(activeRun)} /></View> : null}

        {imageVersions.length ? <>
          <Section title="Image versions" supporting="The selected version is on the right; earlier versions appear beside it.">
            <View testID="image-comparison" style={styles.imageComparison}>
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
              return <View key={change.id} style={styles.changeCard} {...keyHandlerProps(event => { if (isEscapeEvent(event) && showFull) setFullChangeId(null); })}>
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
                  <View style={styles.changeFootActions}>
                    <Button
                      label={showFull ? 'Hide complete contents' : 'Show complete contents'}
                      accessibilityLabel={showFull ? 'Hide complete contents: the file before and after this change' : 'Show complete contents: the file before and after this change'}
                      accessibilityState={{ expanded: showFull }}
                      onPress={() => setFullChangeId(showFull ? null : change.id)}
                      variant="ghost"
                    />
                    <Button
                      label="Save change as…"
                      accessibilityLabel={`Save ${change.path} as a file`}
                      onPress={() => { void saveChange(change); }}
                      variant="ghost"
                    />
                  </View>
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
                {showFull ? <View ref={disclosureFocus} focusable style={styles.fullContents}>
                  <Text style={styles.diffLabel}>Complete file before this change</Text>
                  <ScrollView horizontal><Text selectable style={styles.code}>{change.before || 'This file does not exist yet.'}</Text></ScrollView>
                  <Text style={styles.diffLabel}>Complete file after this change</Text>
                  <ScrollView horizontal><Text selectable style={styles.code}>{change.after}</Text></ScrollView>
                </View> : null}
                {secretBlock ? <Text style={styles.dim}>{secretBlock}</Text> : null}
                <View style={[styles.decisionRow, waitingOnYou && styles.decisionRowWaiting]}>
                  {waitingOnYou ? <Text style={styles.decisionText}>This change is waiting for you</Text> : null}
                  {change.appliedAt && !change.revertedAt
                    ? <Button label="Undo applied change" disabled={!projectRoot} onPress={() => { void onUndo(activeRun, change.id); setUndoneChangeId(change.id); }} variant={waitingOnYou ? 'primary' : 'secondary'} />
                    : change.revertedAt ? <Chip label="Reverted" critical />
                      : change.rejectedAt ? <Chip label="Rejected" critical />
                        : change.supersededAt ? <Chip label="Superseded" critical />
                          : <Button label={applying ? 'Applying change…' : secretBlock ? 'Blocked for secrets · fix first' : !projectRoot ? 'Choose a project folder' : itemStatus === 'done' || itemStatus === 'needs-approval' ? 'Apply change' : itemStatus === 'cancelled' ? 'Run was cancelled' : itemStatus === 'blocked' ? 'Waiting for its dependencies' : itemStatus === 'failed' ? 'This step failed' : 'Waiting for the review that comes next'} disabled={!canApply || applying} onPress={() => onApply(activeRun, change.id)} variant="primary" />}
                  {canReject ? <Button label="Reject" disabled={applying} onPress={() => setRejectingChangeId(change.id)} variant="ghost" /> : null}
                </View>
              </View>;
            })}
          </Section>
        </> : null}

        <Section title="Review findings" supporting="What the reviewers said about this run." action={<Button label="Save review as…" accessibilityLabel="Save the review evidence as a file" onPress={() => { void saveReview(); }} variant="ghost" />}>
          {findings.length ? findings.map(message => <View key={message.id} style={styles.activityRow}>
            <Text style={styles.itemTitle}>{message.from}</Text>
            <Text style={styles.body}>{message.text}</Text>
          </View>) : <Text style={styles.dim}>No findings were recorded for this run.</Text>}
        </Section>

        <Section title="Run receipt" supporting="What was planned, and what happened." action={<CopyButton text={activeRun.id} label="Copy run id" subject="the run id" />}>
          {activeRun.items.map(item => <Text key={item.id} style={styles.body}>
            {item.title} ({item.status}, {activeRun.agentProfiles?.find(agent => agent.id === item.agentId)?.name ?? item.agentId})
          </Text>)}
          <Text style={styles.dim}>Started {new Date(activeRun.createdAt).toLocaleString()} · Updated {new Date(activeRun.updatedAt).toLocaleString()}</Text>
          {activeRun.messages.map(message => <View key={message.id} style={styles.receiptMessage}>
            <Text style={styles.diffLabel}>{message.from} to {message.to} · {message.kind}</Text>
            <Text style={styles.body}>{message.text}</Text>
          </View>)}
        </Section>
      </>}
      {exportNotice ? <Toast title={exportNotice.title} body={exportNotice.body} tone={exportNotice.tone} onDismiss={() => setExportNotice(null)} autoDismissMs={exportNotice.tone === 'critical' ? undefined : 8000} style={styles.resultsNotice} testID="results-export-notice" /> : null}
      {undoneChange ? <Toast title={`Undid ${undoneChange.path}`} body="The applied change was put back the way it was." tone="attention" action={<Button label="Restore change" onPress={() => restoreChange(undoneChange.id)} variant="secondary" />} onDismiss={() => setUndoneChangeId(null)} autoDismissMs={20000} style={styles.resultsNotice} testID="results-undo-notice" /> : null}
    </ScrollView>

    {rejectingChange ? <Modal visible transparent animationType="fade" onRequestClose={() => setRejectingChangeId(null)}>
      <View style={styles.modalBackdrop} {...keyHandlerProps(event => { if (isEscapeEvent(event)) setRejectingChangeId(null); })} focusable>
        <View ref={dialogFocus} focusable accessibilityViewIsModal style={styles.modalCard}>
          <Text style={styles.modalTitle}>Reject this change?</Text>
          <Text style={styles.modalBody}>{rejectingChange.path} will be declined and cannot be applied after that.</Text>
          <View style={styles.modalActions}>
            <Button label="Keep change" onPress={() => setRejectingChangeId(null)} variant="secondary" />
            <Button label="Reject change" onPress={() => { const changeId = rejectingChange.id; setRejectingChangeId(null); onReject(activeRun, changeId); }} variant="critical" />
          </View>
        </View>
      </View>
    </Modal> : null}
  </View>;
}

/**
 * Two runs, side by side.
 *
 * Every row that differs says so in words as well as colour, so the difference survives
 * grayscale and a screen reader. The columns wrap, so the panel still reads at the
 * 900px window floor.
 */
function ComparisonPanel({ comparison, left, right }: { comparison: RunComparison; left: Run; right: Run }) {
  const label = (text: string, differs: boolean) => <View style={styles.comparisonLabelCell}>
    <Text style={styles.comparisonLabel}>{text}</Text>
    {differs ? <Text style={styles.comparisonDiffers}>differs</Text> : null}
  </View>;
  return <View testID="run-comparison" style={styles.comparison}>
    <Text style={styles.title}>Side by side</Text>
    <Text style={styles.dim}>{comparison.differs ? 'These two runs differ on the points marked below.' : 'These two runs match on every point measured here.'}</Text>
    <View style={styles.comparisonHead}>
      <View style={styles.comparisonLabelCell}><Text style={styles.comparisonHeadText}>Measure</Text></View>
      <View style={styles.comparisonCell}><Text numberOfLines={2} style={styles.comparisonRunName}>A · {runName(left)}</Text></View>
      <View style={styles.comparisonCell}><Text numberOfLines={2} style={styles.comparisonRunName}>B · {runName(right)}</Text></View>
    </View>
    {comparison.rows.map(row => <View key={row.key} style={[styles.comparisonRow, row.differs && styles.comparisonRowDiffers]}>
      {label(row.label, row.differs)}
      <View style={styles.comparisonCell}><Text style={styles.comparisonValue}>{row.left}</Text></View>
      <View style={styles.comparisonCell}><Text style={styles.comparisonValue}>{row.right}</Text></View>
    </View>)}
    <Text style={styles.comparisonSection}>Work item statuses</Text>
    {comparison.items.length ? comparison.items.map(item => <View key={item.id} style={[styles.comparisonRow, item.differs && styles.comparisonRowDiffers]}>
      {label(item.title, item.differs)}
      <View style={styles.comparisonCell}><Text style={styles.comparisonValue}>{item.leftStatus ?? 'not in this run'}</Text></View>
      <View style={styles.comparisonCell}><Text style={styles.comparisonValue}>{item.rightStatus ?? 'not in this run'}</Text></View>
    </View>) : <Text style={styles.dim}>Neither run recorded any work items.</Text>}
    <Text style={styles.comparisonSection}>Changed files</Text>
    {comparison.files.length ? comparison.files.map(file => <View key={file.path} style={[styles.comparisonRow, file.differs && styles.comparisonRowDiffers]}>
      <View style={styles.comparisonLabelCell}>
        <Text style={styles.comparisonPath}>{file.path}</Text>
        {file.differs ? <Text style={styles.comparisonDiffers}>differs</Text> : null}
      </View>
      <View style={styles.comparisonCell}><Text style={styles.comparisonValue}>{file.left ? `+${file.left.added} -${file.left.removed}` : 'no change'}</Text></View>
      <View style={styles.comparisonCell}><Text style={styles.comparisonValue}>{file.right ? `+${file.right.added} -${file.right.removed}` : 'no change'}</Text></View>
    </View>) : <Text style={styles.dim}>Neither run changed a file.</Text>}
    <Text style={styles.comparisonSection}>Review findings</Text>
    <View style={styles.comparisonFindings}>
      <View style={styles.comparisonFindingsColumn}>
        <Text style={styles.comparisonLabel}>A · {runName(left)}</Text>
        {comparison.findings.left.length ? comparison.findings.left.map((finding, index) => <Text key={`${finding.from}-${index}`} style={styles.comparisonValue}>{finding.from}: {finding.text}</Text>) : <Text style={styles.dim}>No findings.</Text>}
      </View>
      <View style={styles.comparisonFindingsColumn}>
        <Text style={styles.comparisonLabel}>B · {runName(right)}</Text>
        {comparison.findings.right.length ? comparison.findings.right.map((finding, index) => <Text key={`${finding.from}-${index}`} style={styles.comparisonValue}>{finding.from}: {finding.text}</Text>) : <Text style={styles.dim}>No findings.</Text>}
      </View>
    </View>
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
  inbox: { flex: 1, minWidth: 0, flexDirection: 'row', backgroundColor: colors.page },
  inboxEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  inboxList: { width: 280, flexShrink: 0, padding: space.md, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.line },
  inboxListHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm },
  inboxListTitle: { ...type.label, color: colors.text },
  inboxListCount: { ...type.meta, color: colors.textMuted },
  inboxListScroll: { flex: 1, minHeight: 0 },
  inboxSearch: {
    minHeight: 44,
    marginHorizontal: space.sm,
    marginBottom: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    ...type.bodySmall,
  },
  inboxListContent: { gap: space.xs, paddingBottom: space.sm },
  inboxRow: { gap: space.xs, paddingHorizontal: space.md, paddingVertical: space.md, borderWidth: 1, borderColor: 'transparent', borderRadius: radius.control },
  inboxRowSelected: { backgroundColor: colors.surfaceActive, borderColor: colors.line },
  inboxRowHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  inboxRowTitle: { ...type.bodySmall, flex: 1, color: colors.text, fontWeight: '600' },
  inboxRowTime: { ...type.meta, color: colors.textMuted },
  inboxRowPreview: { ...type.bodySmall, color: colors.textQuiet },
  inboxRowFoot: { flexDirection: 'row', justifyContent: 'space-between', gap: space.sm },
  inboxRowStatus: { ...type.meta, color: colors.textMuted, textTransform: 'capitalize' },
  inboxRowMessages: { ...type.meta, color: colors.textMuted },
  inboxNewRun: { marginTop: space.sm },
  inboxConversation: { flex: 1, minWidth: 0 },
  chatEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl },
  chatRoom: { flex: 1, minWidth: 0, backgroundColor: colors.page },
  chatHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.md, paddingHorizontal: space.xl, paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.line },
  chatHeading: { flex: 1, minWidth: 180, gap: space.xs },
  chatTitle: { ...type.section, color: colors.text },
  chatBrief: { ...type.bodySmall, color: colors.textQuiet },
  chatActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  chatMessages: { flex: 1, minHeight: 0 },
  chatMessageList: { flexGrow: 1, justifyContent: 'flex-end', gap: space.md, padding: space.xl },
  chatMessage: { alignSelf: 'flex-start', maxWidth: '88%', gap: space.xs, padding: space.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.card },
  chatMessageSelf: { alignSelf: 'flex-end', backgroundColor: colors.surfaceRaised },
  chatMessageHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: space.sm },
  chatSender: { ...type.label, color: colors.text },
  chatMessageMeta: { ...type.meta, color: colors.textMuted },
  chatMessageText: { ...type.body, color: colors.textQuiet },
  newMessagesButton: { alignSelf: 'center', marginVertical: space.sm, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.surfaceActive, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.chip },
  newMessagesText: { ...type.label, color: colors.text },
  chatComposer: { flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, paddingHorizontal: space.xl, paddingVertical: space.md, borderTopWidth: 1, borderTopColor: colors.line },
  chatStatus: { ...type.meta, color: colors.textMuted, paddingHorizontal: space.xl, paddingBottom: space.sm },
  page: { flex: 1, backgroundColor: colors.page },
  content: { padding: space.xxl, gap: space.lg, maxWidth: 1180, width: '100%', alignSelf: 'center' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 20, fontWeight: '600' },
  dim: { ...type.bodySmall, color: colors.textMuted },
  body: { ...type.body, color: colors.textQuiet },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md, flexWrap: 'wrap' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  pressed: { opacity: 0.82 },

  figureStrip: { flexDirection: 'row', gap: space.xxl, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.md },
  figure: { gap: space.xs },
  figureValue: { ...type.code, color: colors.text, fontSize: 16, lineHeight: 24 },
  figureLabel: { ...type.meta, color: colors.textMuted },

  itemRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: space.sm },
  itemMain: { flex: 1, gap: space.xs },
  itemTitle: { ...type.body, color: colors.text, fontWeight: '600' },
  activityRow: { borderBottomWidth: 1, borderBottomColor: colors.line, paddingVertical: space.sm, gap: space.xs },
  activityText: { ...type.bodySmall, color: colors.textQuiet, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, marginTop: space.sm },

  input: { minWidth: 280, flex: 1, minHeight: 44, padding: space.md, color: colors.text, backgroundColor: colors.surfaceRaised, borderColor: colors.lineStrong, borderWidth: 1, borderRadius: radius.control },

  reviewLayout: { flex: 1, flexDirection: 'row', backgroundColor: colors.page },
  runList: { width: 260, borderRightWidth: 1, borderRightColor: colors.line, padding: space.lg, gap: space.sm },
  listTitle: { ...type.label, color: colors.textQuiet },
  runListItem: { paddingVertical: space.sm, gap: space.xs },

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
  diffAdded: { color: colors.lead },
  diffRemoved: { color: colors.critical },
  code: { ...type.code, color: colors.text },

  // The one lead block on this screen: the change that is waiting for a person.
  decisionRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap', padding: space.md, borderRadius: radius.control, backgroundColor: colors.surfaceRaised },
  decisionRowWaiting: { borderColor: colors.lead },
  decisionText: { ...type.bodySmall, color: colors.text, fontWeight: '600', marginRight: 'auto' },

  receiptMessage: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: space.sm, gap: space.xs },

  // Run-to-run comparison. The list on the left picks the two runs; the panel on the right
  // measures them against each other.
  runListCompare: { width: 300 },
  runListHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  compareSlots: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xs },
  // 44px: the slot is the only way to choose a side, so it is a real target, not a letter.
  slotButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.chip, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  slotButtonActive: { borderColor: colors.lead, backgroundColor: colors.surfaceActive },
  slotText: { ...type.label, color: colors.textMuted },
  slotTextActive: { color: colors.text, fontWeight: '700' },

  comparison: { gap: space.sm, alignSelf: 'stretch' },
  comparisonHead: { flexDirection: 'row', alignItems: 'stretch', gap: space.md, paddingBottom: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line },
  comparisonHeadText: { ...type.label, color: colors.textQuiet },
  comparisonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md, paddingVertical: space.sm, borderBottomWidth: 1, borderBottomColor: colors.line, borderLeftWidth: 3, borderLeftColor: 'transparent', paddingLeft: space.sm },
  comparisonRowDiffers: { borderLeftColor: colors.attention },
  comparisonLabelCell: { flex: 1, minWidth: 120, gap: space.xs },
  comparisonCell: { flex: 2, minWidth: 0 },
  comparisonRunName: { ...type.label, color: colors.text },
  comparisonLabel: { ...type.bodySmall, color: colors.text },
  comparisonPath: { ...type.code, color: colors.text },
  comparisonValue: { ...type.bodySmall, color: colors.textQuiet },
  // The word is what carries the difference; the colour only repeats it.
  comparisonDiffers: { ...type.meta, color: colors.attention, fontWeight: '700' },
  comparisonSection: { ...type.label, color: colors.textQuiet, marginTop: space.md },
  comparisonFindings: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start', flexWrap: 'wrap' },
  comparisonFindingsColumn: { flex: 1, minWidth: 220, gap: space.xs },

  changeFootActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
  fullContents: { gap: space.xs, padding: space.md, borderRadius: radius.control, backgroundColor: colors.page },

  resultsNotice: { alignSelf: 'stretch' },

  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl, backgroundColor: colors.scrim },
  modalCard: { width: '100%', maxWidth: 440, gap: space.md, padding: space.xl, borderRadius: radius.card, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surfaceRaised },
  modalTitle: { ...type.section, color: colors.text },
  modalBody: { ...type.body, color: colors.textQuiet },
  modalActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
