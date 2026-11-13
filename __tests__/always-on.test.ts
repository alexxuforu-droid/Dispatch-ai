/**
 * The always-on worker: what it does when there is nothing to do, and where it does it.
 *
 * These are pure decisions. The worker is a normal run with its own brief, its own team and
 * its own folder, and the two things that can go wrong -- it repeats itself, or it writes
 * outside its folder -- are decided here, where they can be checked without a provider.
 */

import { angleFor, decideAlwaysOnTurn } from '../src/orchestration/alwaysOn';
import {
  DEFAULT_SANDBOX_FOLDER,
  defaultSandboxFolder,
  idleBehaviourFor,
  isSafeFolderName,
  sandboxFolderFor,
} from '../src/orchestration/sandbox';

describe('decideAlwaysOnTurn', () => {
  it('takes the waiting work when there is some', () => {
    const turn = decideAlwaysOnTurn({ agentName: 'Builder', waiting: ['Write the parser', 'Fix the crash'] });
    expect(turn.kind).toBe('work');
    expect(turn.brief).toContain('Write the parser');
    expect(turn.brief).toContain('Fix the crash');
  });

  it('makes something when nothing is waiting', () => {
    const turn = decideAlwaysOnTurn({ agentName: 'Builder', waiting: [] });
    expect(turn.kind).toBe('make');
    expect(turn.brief.length).toBeGreaterThan(40);
  });

  it('does not repeat the angle it used recently', () => {
    const first = decideAlwaysOnTurn({ agentName: 'Builder', waiting: [], idle: 'anything' });
    const second = decideAlwaysOnTurn({ agentName: 'Builder', waiting: [], idle: 'anything', recentAngles: [first.angle] });
    expect(second.angle).not.toBe(first.angle);
  });

  it('tells the agent not to repeat what it already made', () => {
    const turn = decideAlwaysOnTurn({ agentName: 'Builder', waiting: [], idle: 'anything', recentOutputs: ['clock.png'] });
    expect(turn.brief).toContain('Do not repeat clock.png');
  });

  it('honours a pinned idle behaviour instead of rotating', () => {
    const first = decideAlwaysOnTurn({ agentName: 'Builder', waiting: [], idle: 'picture' });
    const second = decideAlwaysOnTurn({ agentName: 'Builder', waiting: [], idle: 'picture', recentAngles: [first.angle] });
    expect([first.angle, second.angle]).toEqual(['a picture', 'a picture']);
    expect(first.brief).toContain('Paint one picture');
  });

  it('falls back to the free choice for an unknown idle behaviour', () => {
    const turn = decideAlwaysOnTurn({ agentName: 'Builder', waiting: [], idle: 'nonsense' as never });
    expect(turn.kind).toBe('make');
    expect(turn.angle).toBe(angleFor('tool').label);
  });
});

describe('the worker folder', () => {
  it('uses the folder the agent asked for', () => {
    expect(sandboxFolderFor('builder', { builder: { folder: 'Builder Work', idle: 'anything' } })).toBe('Builder Work');
  });

  it('uses the shared default when the agent has no folder of its own', () => {
    expect(sandboxFolderFor('builder', {})).toBe(DEFAULT_SANDBOX_FOLDER);
  });

  it('uses the shared default when the folder name is not usable', () => {
    expect(sandboxFolderFor('builder', { builder: { folder: '../escape', idle: 'anything' } })).toBe(DEFAULT_SANDBOX_FOLDER);
  });

  it('names a folder after the agent when it asks for one without naming it', () => {
    expect(defaultSandboxFolder('Visual Reviewer')).toBe('Visual Reviewer Projects');
    expect(defaultSandboxFolder('///')).toBe('Agent Projects');
  });
});

describe('isSafeFolderName', () => {
  it('accepts ordinary names', () => {
    expect(isSafeFolderName('Builder Work')).toBe(true);
    expect(isSafeFolderName('agent_2-drafts')).toBe(true);
  });

  it('refuses names that could reach outside the folder', () => {
    for (const name of ['..', '.', 'a/b', 'a\\b', 'C:\\Windows', 'a:b', 'a*b', 'a?b']) {
      expect([name, isSafeFolderName(name)]).toEqual([name, false]);
    }
  });

  it('refuses the names Windows reserves', () => {
    for (const name of ['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9']) {
      expect([name, isSafeFolderName(name)]).toEqual([name, false]);
    }
  });

  it('refuses an empty name and a name that is too long', () => {
    expect(isSafeFolderName('   ')).toBe(false);
    expect(isSafeFolderName('x'.repeat(61))).toBe(false);
  });
});

describe('idleBehaviourFor', () => {
  it('is the free choice when the agent has no setting', () => {
    expect(idleBehaviourFor('builder', {})).toBe('anything');
  });

  it('is the setting the agent was given', () => {
    expect(idleBehaviourFor('builder', { builder: { folder: '', idle: 'game' } })).toBe('game');
  });
});
