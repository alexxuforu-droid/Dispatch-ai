import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { FocusPressable } from '../../../Reveal';
import { createProviderVisionAnalyzer, LiveCaptureUpdate, runLiveCaptureLoop } from '../../../capture/liveCaptureLoop';
import { CaptureFrame, CaptureMetrics, CaptureTarget, captureActionRequest, captureImageUrl, parseCaptureTargets } from '../../../capture/captureProtocol';
import { loadProviderProfileResult } from '../../../persistence/providerProfile';
import { Button, Chip, Field, Skeleton, SkeletonGate } from '../../../ui';
import { colors } from '../../../theme';
import { COMPACT_WIDTH } from '../../types';
import { styles } from '../styles';

export type CaptureApi = {
  listTargets(): Promise<string>;
  startCapture(hwndHex: string, processId: number, fps: number, maxEdge: number, jpegQuality: number): Promise<string>;
  nextFrame(afterSequence: number, timeoutMs: number): Promise<string>;
  stopCapture(): Promise<string>;
  startRecording(): Promise<string>;
  stopRecording(): Promise<string>;
  performAction(actionJson: string): Promise<string>;
};

const emptyMetrics: CaptureMetrics = { firstFrameMs: null, capturedFrames: 0, deliveredFrames: 0, droppedFrames: 0, fps: 0 };
const FRAME_RATES = [5, 15, 30];
const MAX_EDGES = [640, 1280, 1920];
const JPEG_QUALITIES = [50, 70, 90];

type Phase = 'idle' | 'starting' | 'live' | 'stopping';

function parseNativeObject(raw: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`The native ${label} response was not valid JSON.`);
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`The native ${label} response was invalid.`);
  return value as Record<string, unknown>;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The computer-use request failed.';
}

function formatMs(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)} ms`;
}

function targetName(target: CaptureTarget): string {
  return target.title || target.processName || 'Untitled window';
}

function CaptureSetting({ label, values, value, suffix, disabled, onChange }: {
  label: string;
  values: number[];
  value: number;
  suffix: string;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return <View style={styles.captureSetting}>
    <Text style={styles.captureSettingLabel}>{label}</Text>
    <View style={styles.captureOptionRow}>
      {values.map(option => <FocusPressable
        key={option}
        accessibilityRole="radio"
        accessibilityLabel={`${label} ${option} ${suffix}`}
        accessibilityState={{ checked: value === option, disabled }}
        disabled={disabled}
        onPress={() => onChange(option)}
        style={[styles.captureOption, value === option && styles.captureOptionSelected, disabled && styles.captureOptionDisabled]}
      ><Text style={[styles.captureOptionText, value === option && styles.captureOptionTextSelected]}>{option}{suffix}</Text></FocusPressable>)}
    </View>
  </View>;
}

function ActionSwitch({ value, disabled, onChange }: { value: boolean; disabled: boolean; onChange: (value: boolean) => void }) {
  return <FocusPressable
    accessibilityRole="switch"
    accessibilityLabel="Allow actions in this window"
    accessibilityState={{ checked: value, disabled }}
    disabled={disabled}
    onPress={() => onChange(!value)}
    style={styles.captureActionSwitch}
  >
    <View style={styles.captureActionCopy}>
      <Text style={styles.captureActionTitle}>Allow actions in this window</Text>
      
    </View>
    <View style={[styles.captureSwitchTrack, value && styles.captureSwitchTrackOn, disabled && styles.captureOptionDisabled]}>
      <View style={[styles.captureSwitchThumb, value && styles.captureSwitchThumbOn]} />
    </View>
  </FocusPressable>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.captureMetric}>
    <Text style={styles.captureMetricLabel}>{label}</Text>
    <Text style={styles.captureMetricValue}>{value}</Text>
  </View>;
}

export const ComputerUseHome = React.memo(function ComputerUseHomeImpl({ width, providerReady, captureApi }: {
  width: number;
  providerReady: boolean;
  captureApi: CaptureApi | null;
}) {
  const [targets, setTargets] = useState<CaptureTarget[]>([]);
  const [selectedHandle, setSelectedHandle] = useState('');
  const [task, setTask] = useState('');
  const [allowActions, setAllowActions] = useState(false);
  const [fps, setFps] = useState(15);
  const [maxEdge, setMaxEdge] = useState(1280);
  const [jpegQuality, setJpegQuality] = useState(70);
  const [phase, setPhase] = useState<Phase>('idle');
  const [loadingTargets, setLoadingTargets] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingPath, setRecordingPath] = useState('');
  const [frame, setFrame] = useState<CaptureFrame | null>(null);
  const [metrics, setMetrics] = useState<CaptureMetrics>(emptyMetrics);
  const [visionLatencyMs, setVisionLatencyMs] = useState<number | null>(null);
  const [actionLatencyMs, setActionLatencyMs] = useState<number | null>(null);
  const [visionRequests, setVisionRequests] = useState(0);
  const [observation, setObservation] = useState('Waiting for a window and task.');
  const [error, setError] = useState('');

  const controllerRef = useRef<AbortController | null>(null);
  const captureStartedRef = useRef(false);
  const recordingRef = useRef(false);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const lastPreviewAtRef = useRef(0);
  const selectedTarget = targets.find(target => target.hwndHex === selectedHandle) ?? null;
  const busy = phase !== 'idle';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
      if (stopPromiseRef.current) return;
      if (recordingRef.current && captureApi) {
        recordingRef.current = false;
        void captureApi.stopRecording().catch(reason => console.error('Could not finalize the computer-use recording during screen cleanup:', reason));
      }
      if (captureStartedRef.current && captureApi) {
        captureStartedRef.current = false;
        void captureApi.stopCapture().catch(reason => console.error('Could not stop native computer-use capture during screen cleanup:', reason));
      }
    };
  }, [captureApi]);

  const refreshTargets = useCallback(async () => {
    if (!captureApi) { setError('Native window capture is unavailable in this build.'); return; }
    setLoadingTargets(true);
    setError('');
    try {
      const nextTargets = parseCaptureTargets(await captureApi.listTargets());
      setTargets(nextTargets);
      setSelectedHandle(current => nextTargets.some(target => target.hwndHex === current) ? current : '');
    } catch (reason) {
      setError(messageOf(reason));
    } finally {
      setLoadingTargets(false);
    }
  }, [captureApi]);

  const finishRecording = useCallback(async () => {
    if (!captureApi || !recordingRef.current) return;
    const result = parseNativeObject(await captureApi.stopRecording(), 'recording stop');
    if (result.recording !== false) throw new Error('The native recorder did not confirm that the MP4 was finalized.');
    recordingRef.current = false;
    if (mountedRef.current) setIsRecording(false);
    if (typeof result.message === 'string' && result.message) {
      if (mountedRef.current) setRecordingPath('');
      throw new Error(result.message);
    }
    if (typeof result.path !== 'string' || !result.path) {
      if (mountedRef.current) setRecordingPath('');
      throw new Error('The MP4 recording did not produce a file.');
    }
    if (mountedRef.current) {
      setRecordingPath(result.path);
    }
  }, [captureApi]);

  const stopSession = useCallback((): Promise<void> => {
    if (stopPromiseRef.current) return stopPromiseRef.current;
    controllerRef.current?.abort();
    if (mountedRef.current) setPhase('stopping');
    const operation = (async () => {
      const failures: string[] = [];
      if (recordingRef.current) {
        try { await finishRecording(); } catch (reason) { failures.push(messageOf(reason)); }
      }
      if (captureStartedRef.current && captureApi) {
        captureStartedRef.current = false;
        try {
          const result = parseNativeObject(await captureApi.stopCapture(), 'capture stop');
          if (typeof result.message === 'string' && result.message) failures.push(result.message);
        } catch (reason) { failures.push(messageOf(reason)); }
      }
      controllerRef.current = null;
      if (mountedRef.current) {
        setPhase('idle');
        if (failures.length) setError([...new Set(failures)].join(' '));
      }
    })();
    stopPromiseRef.current = operation.finally(() => { stopPromiseRef.current = null; });
    return stopPromiseRef.current;
  }, [captureApi, finishRecording]);

  const startSession = useCallback(async () => {
    if (phase !== 'idle') return;
    if (!captureApi) { setError('Native window capture is unavailable in this build.'); return; }
    if (!selectedTarget) { setError('Choose a window before starting capture.'); return; }
    if (!task.trim()) { setError('Add a task for the vision agent first.'); return; }
    if (task.length > 4000) { setError('Keep the task under 4,000 characters.'); return; }
    if (!providerReady) { setError('Connect a vision-capable chat provider before starting.'); return; }

    const controller = new AbortController();
    controllerRef.current = controller;
    setPhase('starting');
    setError('');
    setFrame(null);
    setMetrics(emptyMetrics);
    setVisionLatencyMs(null);
    setActionLatencyMs(null);
    setVisionRequests(0);
    setRecordingPath('');
    setObservation('Waiting for the first frame.');

    try {
      const profile = await loadProviderProfileResult();
      if (profile.status === 'corrupt') throw new Error('The saved provider profile could not be read. Repair it in Advanced settings first.');
      if (controller.signal.aborted) return;
      const started = parseNativeObject(await captureApi.startCapture(selectedTarget.hwndHex, selectedTarget.processId, fps, maxEdge, jpegQuality), 'capture start');
      if (started.started !== true) throw new Error('The native capture session did not confirm it started.');
      if (controller.signal.aborted) {
        await captureApi.stopCapture();
        return;
      }
      captureStartedRef.current = true;
      setPhase('live');
      const analyze = createProviderVisionAnalyzer(profile.value, task);
      const result = await runLiveCaptureLoop({
        nextFrame: (afterSequence, timeoutMs) => captureApi.nextFrame(afterSequence, timeoutMs),
        analyze,
        performAction: async (action, capturedFrame) => {
          const response = parseNativeObject(await captureApi.performAction(captureActionRequest(selectedTarget.hwndHex, capturedFrame, action)), 'action');
          if (response.status !== 'queued') throw new Error(typeof response.message === 'string' ? response.message : 'The selected-window action was rejected.');
        },
        allowActions,
        minVisionIntervalMs: 1000,
        signal: controller.signal,
        onFrame: nextFrame => {
          const now = Date.now();
          if (now - lastPreviewAtRef.current < 250) return;
          lastPreviewAtRef.current = now;
          if (mountedRef.current) setFrame(nextFrame);
        },
        onUpdate: (update: LiveCaptureUpdate) => {
          if (!mountedRef.current) return;
          setMetrics(update.capture);
          setVisionLatencyMs(update.requestLatencyMs);
           if (update.actionLatencyMs !== undefined) setActionLatencyMs(update.actionLatencyMs);
           setVisionRequests(count => count + 1);
           const summary = update.summary || update.error || 'No summary returned.';
           setObservation(update.actionStatus === 'queued' ? `${summary}\nAction queued; its effect is not yet confirmed.` : summary);
        },
      });
      if (mountedRef.current) {
        setMetrics(result);
        setVisionRequests(result.visionRequests);
        if (result.lastVisionLatencyMs !== null) setVisionLatencyMs(result.lastVisionLatencyMs);
        if (result.lastActionLatencyMs !== null) setActionLatencyMs(result.lastActionLatencyMs);
      }
    } catch (reason) {
      if (mountedRef.current) setError(messageOf(reason));
    } finally {
      if (captureStartedRef.current || recordingRef.current) await stopSession();
      else if (controllerRef.current === controller) {
        controllerRef.current = null;
        if (mountedRef.current) setPhase('idle');
      }
    }
  }, [allowActions, captureApi, fps, jpegQuality, maxEdge, phase, providerReady, selectedTarget, stopSession, task]);

  const startRecording = useCallback(async () => {
    if (!captureApi || phase !== 'live' || recordingRef.current) return;
    setError('');
    try {
      const result = parseNativeObject(await captureApi.startRecording(), 'recording start');
      if (result.recording !== true) throw new Error('The native recorder did not confirm recording started.');
      recordingRef.current = true;
      setIsRecording(true);
      if (typeof result.path !== 'string' || !result.path) throw new Error('The native recorder did not provide an output path.');
      setRecordingPath(result.path);
    } catch (reason) {
      setError(messageOf(reason));
    }
  }, [captureApi, phase]);

  const stopRecording = useCallback(async () => {
    setError('');
    try { await finishRecording(); } catch (reason) { setError(messageOf(reason)); }
  }, [finishRecording]);

  return <ScrollView contentContainerStyle={styles.computerUsePage}>
    
    <View style={[styles.computerUseColumns, width < COMPACT_WIDTH && styles.computerUseColumnsNarrow]}>
      <View style={styles.computerUsePreviewColumn}>
        <View style={styles.computerUsePreviewCard}>
          <View style={styles.computerUsePreviewHeader}>
            <View style={styles.computerUsePreviewTitleRow}>
              <Text style={styles.computerUseSectionTitle}>Window preview</Text>
              <Chip label={phase === 'live' ? (isRecording ? 'Recording' : 'Live · sampled frames') : 'Idle'} attention={phase === 'live'} />
            </View>
            <Text style={styles.computerUseSubtle}>{selectedTarget ? targetName(selectedTarget) : 'No window selected'}</Text>
          </View>
          <View style={styles.computerUseFrame}>
            {frame ? <Image accessibilityLabel="Latest sampled window frame" source={{ uri: captureImageUrl(frame) }} resizeMode="contain" style={styles.computerUseFrameImage} /> : <View style={styles.computerUseEmptyFrame}>
              <DispatchIcon name="world" size={30} color={colors.textMuted} />
              <Text style={styles.computerUseEmptyTitle}>{phase === 'live' ? 'Waiting for the first frame' : 'Your selected window will appear here'}</Text>
              
            </View>}
          </View>
          <View style={styles.computerUseMetrics}>
            <Metric label="First frame" value={formatMs(metrics.firstFrameMs)} />
            <Metric label="Capture rate" value={`${metrics.fps.toFixed(1)} FPS`} />
            <Metric label="Dropped frames" value={String(metrics.droppedFrames)} />
            <Metric label="Vision latency" value={formatMs(visionLatencyMs)} />
             <Metric label="Action send" value={formatMs(actionLatencyMs)} />
            <Metric label="Vision updates" value={String(visionRequests)} />
          </View>
          <View style={styles.computerUseObservation}>
            <Text style={styles.captureSettingLabel}>Latest observation</Text>
            <Text style={styles.computerUseObservationText}>{observation}</Text>
          </View>
        </View>
      </View>

      <View style={styles.computerUseControlColumn}>
        <View style={styles.computerUseControlPanel}>
          <View style={styles.computerUseSectionHeading}>
            <Text style={styles.computerUseSectionTitle}>Capture setup</Text>
            <Button label={loadingTargets ? 'Refreshing…' : 'Refresh windows'} onPress={refreshTargets} variant="ghost" disabled={busy || loadingTargets || !captureApi} />
          </View>
          {loadingTargets ? <SkeletonGate active><View style={styles.computerUseTargetList}>{[0, 1, 2, 3].map(row => <View key={row} style={styles.computerUseTarget}>
            <View style={styles.computerUseTargetCopy}><Skeleton style={row % 2 ? styles.computerUseTargetSkeletonTitleWide : styles.computerUseTargetSkeletonTitle} /><Skeleton style={styles.computerUseTargetSkeletonDetail} /></View>
          </View>)}</View></SkeletonGate> : targets.length ? <ScrollView style={styles.computerUseTargetList} nestedScrollEnabled>
            {targets.map(target => {
              const selected = target.hwndHex === selectedHandle;
              return <FocusPressable
                key={target.hwndHex}
                accessibilityRole="radio"
                accessibilityLabel={`Select window ${targetName(target)}`}
                accessibilityState={{ checked: selected, disabled: busy }}
                disabled={busy}
                onPress={() => setSelectedHandle(target.hwndHex)}
                style={[styles.computerUseTarget, selected && styles.computerUseTargetSelected, busy && styles.captureOptionDisabled]}
              >
                <View style={styles.computerUseTargetCopy}>
                  <Text numberOfLines={1} style={styles.computerUseTargetName}>{targetName(target)}</Text>
                  <Text numberOfLines={1} style={styles.computerUseSubtle}>{target.processName || 'Application window'}</Text>
                </View>
                {selected ? <DispatchIcon name="check" size={16} color={colors.lead} /> : null}
              </FocusPressable>;
            })}
          </ScrollView> : <Text style={styles.computerUseNoTargets}>No windows listed yet. Refresh to choose an open app.</Text>}

          <Field
            label="Task for the vision agent"
            value={task}
            onChangeText={setTask}
            placeholder="Describe what to look for or do…"
            multiline
            style={styles.computerUseTaskField}
          />

          <CaptureSetting label="Capture rate" values={FRAME_RATES} value={fps} suffix=" FPS" disabled={busy} onChange={setFps} />
          <CaptureSetting label="Max image edge" values={MAX_EDGES} value={maxEdge} suffix=" px" disabled={busy} onChange={setMaxEdge} />
          <CaptureSetting label="JPEG quality" values={JPEG_QUALITIES} value={jpegQuality} suffix="%" disabled={busy} onChange={setJpegQuality} />

          <ActionSwitch value={allowActions} disabled={busy} onChange={setAllowActions} />
          

          <View style={styles.computerUseButtons}>
            {phase === 'live' ? <Button label="Stop capture" onPress={() => { void stopSession(); }} variant="secondary" /> : <Button label={phase === 'starting' ? 'Starting…' : 'Start capture'} onPress={() => { void startSession(); }} variant="primary" disabled={phase !== 'idle' || !providerReady || !selectedTarget || !task.trim() || !captureApi} accessibilityState={{ busy: phase === 'starting' }} />}
            {phase === 'live' && !isRecording ? <Button label="Start recording" onPress={() => { void startRecording(); }} variant="secondary" /> : null}
            {phase === 'live' && isRecording ? <Button label="Stop recording" onPress={() => { void stopRecording(); }} variant="secondary" /> : null}
          </View>
          
          {isRecording && recordingPath ? <Text selectable style={styles.computerUseRecordingPath}>Recording to {recordingPath}</Text> : null}
          {!isRecording && recordingPath ? <Text selectable style={styles.computerUseRecordingPath}>Saved recording: {recordingPath}</Text> : null}
          {phase === 'stopping' ? <Text style={styles.computerUseSubtle}>Stopping capture and finalizing any recording…</Text> : null}
          {error ? <Text accessibilityRole="alert" style={styles.computerUseError}>{error}</Text> : null}
        </View>
      </View>
    </View>
  </ScrollView>;
});
