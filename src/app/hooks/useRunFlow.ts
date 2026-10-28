import { useCallback, useEffect, useRef, useState } from 'react';
import { loadProviderProfile } from '../../persistence/providerProfile';
import { saveRunSnapshot } from '../../persistence/runStore';
import { applyProjectChanges, applyProjectFile, removeProjectFile } from '../../persistence/workspaceProject';
import { createPlannedRun, executePlannedRun } from '../../orchestration/model-runner';
import { CheckpointPolicy, DesignAnnotation, Run, RunMission } from '../../orchestration/types';
import { logHumanDecision } from '../audit/humanDecisions';
import { acceptArtifact, applyCodeChange, rejectCodeChange, undoCodeChange } from '../controllers/applyController';
import { approvePlan, canApprovePlan, startRun, startRunRefusal, RunTeam } from '../controllers/runController';
import { AgentSettings, NoticeReporter } from '../controllers/types';
import { LiveRunPolicy, snapshotRunPolicy } from '../policy/runPolicy';
import { RunSession } from '../state/useRunSession';
import { Role, Screen } from '../types';

export type RunFlowOptions = {
  draft: string;
  roles: Role[];
  providerReady: boolean;
  /** The switches as they are now. A run freezes them when its plan is made. */
  live: LiveRunPolicy;
  checkpointPolicy: CheckpointPolicy;
  planningDebate: boolean;
  mission?: RunMission;
  designReference?: { uri: string; mimeType: string };
  designAnnotations?: DesignAnnotation[];
  team?: RunTeam;
  agents: AgentSettings;
  projectRoot: string;
  session: RunSession;
  /** Reports what happened, and how serious it is. */
  setNotice: NoticeReporter;
  setDraft: (text: string) => void;
  setScreen: (screen: Screen) => void;
  clearBriefContext: () => void;
  onNeedsTeam: () => void;
  designReturnAfterRun: React.MutableRefObject<boolean>;
};

/**
 * The run controls, with the abort controller kept here.
 *
 * The controller is the only piece of state that must be set synchronously: `runBusy` is
 * render-time state, so a double press inside one frame reads it as false twice, and the second
 * controller would orphan the first with no abort path left to it. The ref closes that window
 * whatever the engine does, so it stays next to the handlers that use it.
 */
export function useRunFlow(options: RunFlowOptions) {
  const {
    draft, roles, providerReady, live, checkpointPolicy, planningDebate, mission, designReference,
    designAnnotations, team, agents, projectRoot, session, setNotice,
    setDraft, setScreen, clearBriefContext, onNeedsTeam, designReturnAfterRun,
  } = options;
  const { current, upsertRun, clearCurrent } = session;

  const [runBusy, setRunBusy] = useState(false);
  const [cancelRequested, setCancelRequested] = useState(false);
  const [pendingBrief, setPendingBrief] = useState('');
  const [applyingChanges, setApplyingChanges] = useState<string[]>([]);
  const runController = useRef<AbortController | null>(null);

  useEffect(() => () => { runController.current?.abort(); }, []);

  const updateRun = useCallback((updated: Run) => {
    upsertRun(updated);
    void saveRunSnapshot(updated).catch(() => setNotice('Could not save this run update on the device.', 'critical'));
  }, [upsertRun, setNotice]);

  const cancelRun = useCallback(() => {
    if (!runController.current || runController.current.signal.aborted) return;
    setCancelRequested(true); setNotice('Stopping the current run…', 'neutral'); runController.current.abort();
  }, [setNotice]);

  const start = useCallback(async () => {
    const brief = draft.trim();
    const refusal = startRunRefusal({ brief, roles, busy: runBusy, providerReady });
    if (refusal) {
      if (refusal.outcome === 'needs-team') {
        designReturnAfterRun.current = false;
        onNeedsTeam();
        setNotice('Choose an agent team, then start the task again.', 'attention');
      }
      if (refusal.outcome === 'needs-provider') {
        designReturnAfterRun.current = false;
        setNotice('Connect an OpenAI-compatible provider and choose a model in Settings.', 'attention');
        setScreen('settings');
      }
      return;
    }
    // Same re-entrancy window as approvePlan: runBusy is render-time state, so a double-press
    // passes twice and the second controller orphans the first. Guard on the ref, synchronously.
    if (runController.current) return;
    const controller = new AbortController(); runController.current = controller;
    setCancelRequested(false); setNotice(''); clearCurrent(); setPendingBrief(brief); setDraft(''); setRunBusy(true);
    try {
      const profile = await loadProviderProfile();
      const result = await startRun({
        brief, roles, busy: false, providerReady: true,
        live, checkpointPolicy, planningDebate, mission, designReference, designAnnotations, team, agents,
        profile, projectRoot, signal: controller.signal,
        plan: createPlannedRun,
        onPlanned: value => { upsertRun(value); },
        onUpdate: value => { upsertRun(value); },
      });
      if (result.outcome === 'failed') {
        designReturnAfterRun.current = false;
        setDraft(brief);
        setNotice(result.message, 'critical');
        return;
      }
      if (result.outcome === 'started') {
        // The run freezes the policy it was planned with, so a toggle flipped between planning
        // and approval cannot change what this run does.
        const planned: Run = { ...result.run, policy: snapshotRunPolicy(live) };
        upsertRun(planned);
        void saveRunSnapshot(planned).catch(() => setNotice('Could not save this run update on the device.', 'critical'));
        clearBriefContext();
      }
    } catch (error) {
      designReturnAfterRun.current = false;
      setDraft(brief);
      setNotice(controller.signal.aborted ? 'Planning stopped. Your task is back in the composer.' : error instanceof Error ? error.message : 'The run could not be started.', controller.signal.aborted ? 'neutral' : 'critical');
    } finally {
      if (runController.current === controller) runController.current = null;
      setRunBusy(false); setPendingBrief(''); setCancelRequested(false);
    }
  }, [draft, roles, runBusy, providerReady, live, checkpointPolicy, planningDebate, mission, designReference, designAnnotations, team, agents, projectRoot, upsertRun, clearCurrent, setNotice, setDraft, setScreen, clearBriefContext, onNeedsTeam, designReturnAfterRun]);

  const approve = useCallback(async (targetRun: Run | null = current) => {
    if (!canApprovePlan(targetRun, runBusy)) return;
    // runBusy is render-time state, so two presses inside one frame both read false and both pass.
    // The second then overwrites runController.current, leaving the first executor running with no
    // abort path -- cancel could only ever reach the newer one. This ref is set synchronously, so
    // it closes the window regardless of when React commits.
    if (runController.current) return;
    const controller = new AbortController(); runController.current = controller;
    setCancelRequested(false); setRunBusy(true); setNotice('');
    try {
      const profile = await loadProviderProfile();
      const result = await approvePlan({
        run: targetRun, busy: false, live, checkpointPolicy, roles, agents, profile, projectRoot,
        signal: controller.signal,
        execute: executePlannedRun,
        onUpdate: value => {
          upsertRun(value);
          if (designReturnAfterRun.current && value.status === 'completed') { designReturnAfterRun.current = false; setScreen('design'); }
        },
      });
      if (result.outcome === 'failed') { setNotice(result.message, 'critical'); return; }
      if (result.outcome === 'started') {
        upsertRun(result.run);
        if (designReturnAfterRun.current && result.run.status === 'completed') { designReturnAfterRun.current = false; setScreen('design'); }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The approved plan could not be started.', 'critical');
    } finally {
      if (runController.current === controller) runController.current = null;
      setRunBusy(false); setCancelRequested(false);
    }
  }, [current, runBusy, live, checkpointPolicy, roles, agents, projectRoot, upsertRun, setNotice, setScreen, designReturnAfterRun]);

  const undo = useCallback(async (changeId: string, targetRun: Run | null = current) => {
    const result = await undoCodeChange({
      run: targetRun, changeId, projectRoot,
      applyFile: applyProjectFile,
      removeFile: removeProjectFile,
    });
    if (result.outcome === 'undone') {
      updateRun(result.run);
      logHumanDecision(result.run, { action: 'undo', changeId: result.change.id, path: result.change.path });
      setNotice(result.message, 'success');
    } else if (result.outcome === 'failed') {
      setNotice(result.message, 'critical');
    }
  }, [current, projectRoot, updateRun, setNotice]);

  const apply = useCallback(async (changeId: string, targetRun: Run | null = current) => {
    if (applyingChanges.includes(changeId)) return;
    setApplyingChanges(currentIds => [...currentIds, changeId]);
    try {
      const result = await applyCodeChange({
        run: targetRun, changeId, projectRoot, applying: applyingChanges.includes(changeId),
        applyFile: applyProjectFile,
        removeFile: removeProjectFile,
        // A proposal that touches more than one file is written as one unit, and the run
        // snapshot is written inside that unit, so an undo only exists once the device has
        // recorded the change.
        applyChanges: applyProjectChanges,
        persistSnapshot: run => saveRunSnapshot(run),
      });
      if (result.outcome === 'applied') {
        upsertRun(result.run);
        logHumanDecision(result.run, { action: 'apply', changeId: result.change.id, path: result.change.path });
        setNotice(result.message, 'success', () => { void undo(changeId, result.run); });
      } else if (result.outcome === 'blocked') {
        setNotice(result.message, 'attention');
      } else if (result.outcome === 'failed') {
        setNotice(result.message, 'critical');
      }
    } finally {
      setApplyingChanges(currentIds => currentIds.filter(id => id !== changeId));
    }
  }, [applyingChanges, current, projectRoot, upsertRun, setNotice, undo]);

  const reject = useCallback((targetRun: Run, changeId: string) => {
    const updated = rejectCodeChange(targetRun, changeId);
    if (!updated) return;
    updateRun(updated);
    logHumanDecision(updated, { action: 'reject', changeId, path: targetRun.changes?.find(candidate => candidate.id === changeId)?.path });
  }, [updateRun]);

  const accept = useCallback((targetRun: Run, artifactId: string) => {
    const updated = acceptArtifact(targetRun, artifactId);
    updateRun(updated);
    logHumanDecision(updated, { action: 'apply', changeId: artifactId });
  }, [updateRun]);

  const resetPendingBrief = useCallback(() => setPendingBrief(''), []);

  const commitPlanTitle = useCallback((itemId: string, title: string) => {
    if (!current || current.status !== 'queued' || !title.trim()) return;
    const updated = { ...current, items: current.items.map(item => item.id === itemId ? { ...item, title: title.trim().slice(0, 180) } : item), updatedAt: new Date().toISOString() };
    upsertRun(updated);
    void saveRunSnapshot(updated).catch(() => setNotice('Could not save the edited plan on this device.', 'critical'));
  }, [current, upsertRun, setNotice]);

  return {
    runBusy,
    cancelRequested,
    pendingBrief,
    applyingChanges,
    startRun: start,
    approvePlan: approve,
    applyCodeChange: apply,
    undoCodeChange: undo,
    rejectCodeChange: reject,
    acceptArtifact: accept,
    commitPlanTitle,
    updateRun,
    cancelRun,
    resetPendingBrief,
  };
}
