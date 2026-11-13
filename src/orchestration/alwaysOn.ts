import { IdleBehaviour } from './types';

/**
 * The always-on worker.
 *
 * While the app is open and always-on mode is on, one agent keeps working. It is sent to find
 * something to do; when there is genuinely nothing to take, it makes something of its own
 * choosing. The decision is a pure function so it can be tested without a provider, a renderer
 * or a clock.
 */

export type AlwaysOnTurn = {
  /** `work` takes the work that is waiting; `make` builds something of its own. */
  kind: 'work' | 'make';
  /** The name of the thing being made, for the log. */
  angle: string;
  /** The sentence the agent is sent. */
  brief: string;
  /** Why this turn was chosen, in one line, for the person reading the log. */
  reason: string;
};

/**
 * What an agent can make when it has nothing to do.
 *
 * These are angles, not a script. `anything` walks through them and takes the one it has not
 * used recently, so two turns in a row do not produce the same thing: a worker that painted
 * the same picture every five minutes was technically always working and practically useless.
 */
const ANGLES: { id: Exclude<IdleBehaviour, 'anything'>; label: string; prompt: string }[] = [
  { id: 'tool', label: 'a small tool', prompt: 'Build one small tool that would be genuinely useful in this workspace. Keep it to one file or one screen, make it work, and say in one line what it does.' },
  { id: 'picture', label: 'a picture', prompt: 'Paint one picture. Choose a subject you have not painted before: it can be a place, an object, a diagram or an idea. Say in one line what it shows.' },
  { id: 'report', label: 'a short report', prompt: 'Write a short report on something you noticed about this workspace that nobody has written down yet. Three short sections, no filler.' },
  { id: 'game', label: 'a tiny game', prompt: 'Make one tiny playable thing: a puzzle, a toy, a one-screen game. It must be playable, and you must say in one line how to play it.' },
];

/** The angle one idle behaviour means, and what it is called in the log. */
export function angleFor(idle: IdleBehaviour): { id: string; label: string; prompt: string } {
  return ANGLES.find(angle => angle.id === idle) ?? ANGLES[0];
}

/**
 * Decides what the always-on worker does this turn.
 *
 * The waiting list is the work that is queued or held for review anywhere in the workspace.
 * When there is some, the worker takes it: that is the useful answer. When there is none, the
 * worker makes something, and what it makes follows the agent's own setting. With the free
 * choice it takes an angle it has not used recently, so the output changes from turn to turn.
 */
export function decideAlwaysOnTurn(input: {
  agentName: string;
  /** The work that is waiting anywhere in the workspace. */
  waiting: string[];
  /** What this agent does when it has nothing to do. */
  idle?: IdleBehaviour;
  /** The angles used by the last few turns, newest last. */
  recentAngles?: string[];
  /** What the last few turns produced, so the worker does not repeat itself. */
  recentOutputs?: string[];
}): AlwaysOnTurn {
  const waiting = input.waiting.map(title => title.trim()).filter(Boolean).slice(0, 5);
  if (waiting.length) {
    return {
      kind: 'work',
      angle: 'waiting work',
      reason: 'Work was waiting, so the worker took it.',
      brief: `You are ${input.agentName}. You are working on your own because nothing else is running. Take the next piece of waiting work and finish it: ${waiting.join('; ')}. If none of it can be done, say in one line why not.`,
    };
  }
  const used = new Set((input.recentAngles ?? []).map(label => label.trim()));
  const free = (input.idle ?? 'anything') === 'anything';
  // The angles already used are recorded by their label, and matched here by label or by id,
  // so a worker that made "a small tool" last time does not make one again this time.
  const angle = free ? (ANGLES.find(candidate => !used.has(candidate.label) && !used.has(candidate.id)) ?? ANGLES[0]) : angleFor(input.idle ?? 'anything');
  const made = (input.recentOutputs ?? []).map(name => name.trim()).filter(Boolean).slice(0, 4);
  const avoid = made.length ? ` Do not repeat ${made.join(', ')}.` : '';
  return {
    kind: 'make',
    angle: angle.label,
    reason: 'Nothing was waiting, so the worker made something of its own.',
    brief: `You are ${input.agentName}. You are working on your own because nothing else is running and there is nothing queued. Make ${angle.label}. ${angle.prompt}${avoid} Choose the subject yourself: it must be new, and it must be yours.`,
  };
}
