import { defaultAgentPermissions } from '../../persistence/workspace';
import { ProviderProfile } from '../../persistence/providerProfile';
import { CheckpointPolicy, DesignAnnotation, Run, RunMission } from '../../orchestration/types';
import { LiveRunPolicy, effectiveRunPolicy } from '../policy/runPolicy';
import { Role } from '../types';
import { AgentSettings, ConfiguredRole, ExecuteRunInput, PlanRunInput } from './types';

/** The team a run is planned for. */
export type RunTeam = { id?: string; name?: string; playbook?: string };

/**
 * The roles a run executes with.
 *
 * The same expression used to be written twice, once when a plan was created and once when it
 * was approved, so the two could drift.
 */
export function configureRoles(roles: Role[], settings: AgentSettings): ConfiguredRole[] {
  return roles.map((role, index) => ({
    ...role,
    modelId: settings.agentModels[role.id]?.trim() || undefined,
    avatarId: settings.agentAvatars[role.id] ?? ((index % 199) + 1),
    permissions: settings.agentPermissions[role.id] ?? defaultAgentPermissions,
    rank: settings.agentRanks[role.id] ?? 1,
    memory: settings.agentMemory[role.id] ?? '',
  }));
}

export type StartRunContext = {
  brief: string;
  roles: Role[];
  busy: boolean;
  providerReady: boolean;
  /** The switches as they are now. They are frozen onto the run as it is planned. */
  live: LiveRunPolicy;
  checkpointPolicy: CheckpointPolicy;
  planningDebate: boolean;
  mission?: RunMission;
  designReference?: { uri: string; mimeType: string };
  designAnnotations?: DesignAnnotation[];
  team?: RunTeam;
  agents: AgentSettings;
  profile: ProviderProfile;
  projectRoot: string;
  signal: AbortSignal;
  /** The plan creator. Injected so this controller can be driven without a provider. */
  plan: (input: PlanRunInput) => Promise<Run>;
  onPlanned: (run: Run) => void;
  onUpdate: (run: Run) => void;
};

export type StartRunResult =
  | { outcome: 'started'; run: Run }
  | { outcome: 'needs-team' }
  | { outcome: 'needs-provider' }
  | { outcome: 'busy' }
  | { outcome: 'failed'; message: string };

/**
 * Why a run cannot start yet, or null when it can.
 *
 * Split out so the App can refuse before it creates an abort controller, and so the refusal has
 * one answer wherever it is asked for.
 */
export function startRunRefusal(context: Pick<StartRunContext, 'brief' | 'roles' | 'busy' | 'providerReady'>): StartRunResult | null {
  if (!context.brief.trim() || context.busy) return { outcome: 'busy' };
  if (!context.roles.length) return { outcome: 'needs-team' };
  if (!context.providerReady) return { outcome: 'needs-provider' };
  return null;
}

/**
 * Plans a run and starts it.
 *
 * A plain function over an explicit context: the engine calls are injected, so the whole path
 * can be driven in a test without a renderer or a provider.
 */
export async function startRun(context: StartRunContext): Promise<StartRunResult> {
  const refusal = startRunRefusal(context);
  if (refusal) return refusal;
  const brief = context.brief.trim();
  try {
    const planned = await context.plan({
      brief,
      mission: context.mission,
      designReferenceUri: context.designReference?.uri,
      designReferenceMime: context.designReference?.mimeType,
      designAnnotations: context.designAnnotations,
      roles: configureRoles(context.roles, context.agents),
      teamId: context.team?.id,
      teamName: context.team?.name,
      teamPlaybook: context.team?.playbook,
      planningDebate: context.planningDebate,
      checkpointPolicy: context.checkpointPolicy,
      maxConcurrency: context.live.maxConcurrency,
      peerApprovalEnabled: context.live.peerApprovalEnabled,
      plugins: context.live.plugins,
      profile: context.profile,
      projectRoot: context.projectRoot,
      reviewCode: context.live.reviewCode,
      reviewImages: context.live.reviewImages,
      signal: context.signal,
      onPlanned: context.onPlanned,
      onUpdate: context.onUpdate,
    });
    return { outcome: 'started', run: planned };
  } catch (error) {
    return {
      outcome: 'failed',
      message: context.signal.aborted
        ? 'Planning stopped. Your task is back in the composer.'
        : error instanceof Error ? error.message : 'The run could not be started.',
    };
  }
}

export type ApprovePlanContext = {
  run: Run | null;
  busy: boolean;
  /** The switches as they are now. Only runs with no snapshot of their own fall back to these. */
  live: LiveRunPolicy;
  checkpointPolicy: CheckpointPolicy;
  roles: Role[];
  agents: AgentSettings;
  profile: ProviderProfile;
  projectRoot: string;
  signal: AbortSignal;
  /** The executor. Injected so this controller can be driven without a provider. */
  execute: (input: ExecuteRunInput) => Promise<Run>;
  onUpdate: (run: Run) => void;
};

export type ApprovePlanResult =
  | { outcome: 'started'; run: Run }
  | { outcome: 'skipped' }
  | { outcome: 'failed'; message: string };

const approvable = ['queued', 'cancelled', 'failed', 'needs-approval'];

/**
 * Whether this run is waiting to start or resume, and nothing else is running.
 *
 * One answer, asked in two places: the App, before it creates an abort controller, and the
 * controller itself, so a direct call refuses the same way.
 */
export function canApprovePlan(run: Run | null, busy: boolean): run is Run {
  return !!run && approvable.includes(run.status) && !busy;
}

/**
 * Approves a plan and executes it under the policy the plan was created with.
 *
 * The switches a run executes under are frozen onto it when the plan is made, so a toggle
 * flipped between planning and approval cannot change what this run does. A run saved before the
 * snapshot existed has none, and falls back to the live settings, which is all it ever had.
 */
export async function approvePlan(context: ApprovePlanContext): Promise<ApprovePlanResult> {
  const targetRun = context.run;
  if (!canApprovePlan(targetRun, context.busy)) return { outcome: 'skipped' };
  try {
    const policy = effectiveRunPolicy(targetRun, context.live);
    const completed = await context.execute({
      run: targetRun,
      roles: configureRoles(context.roles, context.agents),
      profile: context.profile,
      projectRoot: context.projectRoot,
      reviewCode: policy.reviewCode,
      reviewImages: policy.reviewImages,
      peerApprovalEnabled: policy.peerApprovalEnabled,
      maxConcurrency: policy.maxConcurrency,
      checkpointPolicy: context.checkpointPolicy,
      plugins: policy.plugins,
      signal: context.signal,
      onUpdate: context.onUpdate,
    });
    return { outcome: 'started', run: completed };
  } catch (error) {
    return { outcome: 'failed', message: error instanceof Error ? error.message : 'The approved plan could not be started.' };
  }
}
