import type { createPlannedRun, executePlannedRun } from '../../orchestration/model-runner';
import type { ApplyBatchResult, ProjectFileChange } from '../../persistence/workspaceProject';
import { AgentPermissions, AgentProvider } from '../../orchestration/types';
import { Role } from '../types';

/**
 * How a notice reads.
 *
 * The same four tones the toast component knows, so a screen can say how serious a message
 * is without inventing a colour: a failure is critical, a refusal is attention, and a
 * completed action is success.
 */
export type NoticeTone = 'neutral' | 'success' | 'attention' | 'critical';

/**
 * Reports a notice to the app.
 *
 * The undo is part of the notice, not a separate channel: a notice that carries a way back
 * stays on screen until it is used, and one that does not may leave on its own.
 */
export type NoticeReporter = (text: string, tone?: NoticeTone, undo?: (() => void) | null) => void;

/** A team role with the per-agent settings the engine needs, as the plan is created. */
export type ConfiguredRole = Role & {
  modelId?: string;
  avatarId: number;
  permissions: AgentPermissions;
  rank: number;
  memory: string;
  /** The endpoint, models and key slot this agent brings, when it brings any. */
  provider?: AgentProvider;
};

/** The per-agent settings a team carries, as the workspace stores them. */
export type AgentSettings = {
  agentModels: Record<string, string>;
  agentAvatars: Record<string, number>;
  agentPermissions: Record<string, AgentPermissions>;
  agentRanks: Record<string, number>;
  agentMemory: Record<string, string>;
  agentProviders: Record<string, AgentProvider>;
};

/**
 * The input the plan creator takes, and the input the executor takes.
 *
 * Taken from the engine's own signatures so the controller cannot drift from what the engine
 * accepts. Type-only, so the controller still runs without the engine loaded.
 */
export type PlanRunInput = Parameters<typeof createPlannedRun>[0];
export type ExecuteRunInput = Parameters<typeof executePlannedRun>[0];

/** Writes a file into the project. The App passes the native bridge in. */
export type ApplyFile = (root: string, path: string, expected: string, replacement: string, createOnly: boolean) => Promise<unknown>;
/** Removes a file from the project. */
export type RemoveFile = (root: string, path: string, expected: string) => Promise<unknown>;
/**
 * Writes every file of one proposal as a unit.
 *
 * The batch reports success only when every file was written AND the applied state was
 * persisted, so an undo never exists for a change the device did not record.
 */
export type ApplyChanges = (root: string, changes: ProjectFileChange[], persistAppliedState: () => Promise<void>) => Promise<ApplyBatchResult>;
