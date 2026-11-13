import { useCallback, useEffect, useRef, useState } from 'react';
import { decideAlwaysOnTurn } from '../../orchestration/alwaysOn';
import { ALWAYS_ON_SANDBOX_NOTE, idleBehaviourFor, sandboxFolderFor } from '../../orchestration/sandbox';
import { AgentSetup, Run } from '../../orchestration/types';
import { ensureProjectFolder } from '../../persistence/workspaceProject';
import { NoticeReporter } from '../controllers/types';
import { Role } from '../types';

/** What the always-on worker is doing right now. */
export type AlwaysOnStatus = 'off' | 'waiting' | 'working';

export type AlwaysOnOptions = {
  /** The switch in the top bar. */
  enabled: boolean;
  /** How many minutes between two turns. */
  minutes: number;
  /** The agent that works alone. Empty means the first one on the team. */
  agentId: string;
  roles: Role[];
  /** How each agent works on its own: its folder and what it makes when idle. */
  agentSetups: Record<string, AgentSetup>;
  /** Another run is going, so a turn would collide with it. */
  busy: boolean;
  providerReady: boolean;
  /** The project the worker keeps its folder in. */
  projectRoot: string;
  /** The work that is waiting anywhere in the workspace. */
  waiting: string[];
  /** Starts the turn and approves its own plan, because nobody is watching. */
  runTurn: (brief: string, roles: Role[], projectRoot: string) => Promise<Run | null>;
  setNotice: NoticeReporter;
};

/**
 * Keeps one agent working while the app is open.
 *
 * The turn starts as soon as the switch is on and repeats every `minutes`. A tick that lands
 * while another run is going is skipped rather than queued behind it: two runs writing to the
 * same workspace is not something this mode should do behind the person's back.
 *
 * The worker works in its own folder inside the project, and the folder it was given is the
 * one it uses every time. The values the tick reads change while the app runs, so they are
 * kept in a ref and the timer is not rebuilt for them. Otherwise every run update would
 * restart the clock and the worker would never get a turn.
 */
export function useAlwaysOn(options: AlwaysOnOptions) {
  const { enabled, minutes } = options;
  const [status, setStatus] = useState<AlwaysOnStatus>('off');
  const [lastTurnAt, setLastTurnAt] = useState('');
  const [lastTurnDetail, setLastTurnDetail] = useState('');
  const running = useRef(false);
  // The last few angles and the last few things the worker made, so the next turn does not
  // repeat them.
  const angles = useRef<string[]>([]);
  const outputs = useRef<string[]>([]);

  const latest = useRef(options);
  latest.current = options;

  const turn = useCallback(async () => {
    if (running.current) return;
    const now = latest.current;
    if (now.busy) {
      setStatus('waiting');
      setLastTurnDetail('Skipped: a run was already going.');
      return;
    }
    const agent = now.roles.find(role => role.id === now.agentId) ?? now.roles[0];
    if (!agent) {
      now.setNotice('Always-on mode needs one agent on the team.', 'attention');
      setStatus('waiting');
      return;
    }
    if (!now.providerReady) {
      now.setNotice('Always-on mode needs a configured provider before it can work.', 'attention');
      setStatus('waiting');
      return;
    }
    running.current = true;
    setStatus('working');
    try {
      const folder = sandboxFolderFor(agent.id, now.agentSetups);
      const decision = decideAlwaysOnTurn({
        agentName: agent.label,
        waiting: now.waiting,
        idle: idleBehaviourFor(agent.id, now.agentSetups),
        recentAngles: angles.current,
        recentOutputs: outputs.current,
      });
      const brief = `${decision.brief}\n\n${ALWAYS_ON_SANDBOX_NOTE} Your folder is "${folder}".`;
      // The worker builds things, so it must be allowed to write files and to make images even
      // when the role it was given does not normally do that.
      const kinds = Array.from(new Set([...agent.kinds, 'code', 'image'] as Role['kinds']));
      const team: Role[] = [{ ...agent, kinds }];
      const root = now.projectRoot ? await ensureProjectFolder(now.projectRoot, folder) : '';
      const run = await now.runTurn(brief, team, root);
      angles.current = [...angles.current, decision.angle].slice(-4);
      const produced = [
        ...(run?.artifacts ?? []).map(artifact => artifact.name),
        ...(run?.changes ?? []).map(change => change.path),
      ];
      outputs.current = [...outputs.current, ...produced].slice(-6);
      setLastTurnAt(new Date().toISOString());
      setLastTurnDetail(run
        ? `${decision.kind === 'make' ? `Made ${decision.angle}` : 'Worked on waiting work'} as ${agent.label}.`
        : `The turn as ${agent.label} did not finish.`);
      setStatus('waiting');
    } catch (error) {
      setLastTurnDetail(error instanceof Error ? error.message : 'The turn failed.');
      setStatus('waiting');
    } finally {
      running.current = false;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    void turn();
    const timer = setInterval(() => { void turn(); }, Math.max(1, minutes) * 60_000);
    return () => clearInterval(timer);
  }, [enabled, minutes, turn]);

  return { status, lastTurnAt, lastTurnDetail, turn };
}
