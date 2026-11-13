import { ChatContentPart } from '../providers/openai-compatible';
import { ProviderProfile } from '../persistence/providerProfile';
import { Coordinator } from './coordinator';
import { EventStore } from './event-store';
import { PersistentRunEventStore, saveRunSnapshot } from '../persistence/runStore';
import { Agent, AgentPermissions, AgentProvider, DesignAnnotation, Run, RunMission, Team } from './types';
import { readDesignReferenceImage } from '../persistence/workspaceProject';
import { clearGeneratedImages } from '../persistence/generatedImageCache';
import { ModelAgentExecutor } from './executor';
import { ModelRunReviewer } from './reviewer';
import { makePlan } from './planner';
import { defaultPluginFlags } from './plugins';
import type { PluginFlags } from './plugins';

export { defaultPluginFlags } from './plugins';
export { codeApplySecretBlock } from './review';
export type { PluginFlags } from './plugins';
export { ModelAgentExecutor } from './executor';
export { ModelRunReviewer } from './reviewer';
export { makePlan } from './planner';
export type { PlannedSteps } from './planner';
const capabilities: Record<string, Agent['kinds']> = {
  planner: ['plan'], builder: ['code', 'image'], reviewer: ['code', 'review'], 'art-critic': ['image', 'review'],
};

const noPermissions: AgentPermissions = { read: false, grep: false, write: false, edit: false };
const liveRunControls = new Map<string, (text: string) => Promise<boolean>>();

export async function steerActiveRun(runId: string, text: string): Promise<boolean> {
  const clean = text.trim().slice(0, 2000);
  if (!clean) return false;
  return liveRunControls.get(runId)?.(clean) ?? false;
}

export function makeTeam(roles: { id: string; label: string; detail: string; modelId?: string; avatarId?: number; rank?: number; kinds?: Agent['kinds']; permissions?: AgentPermissions; memory?: string; provider?: AgentProvider }[], teamId = 'personal-team', teamName = 'My agent team', playbook = '', debate = false): Team {
  const agents: Agent[] = roles.map(role => ({ id: role.id, name: role.label, role: role.detail, modelId: role.modelId?.trim() || undefined, avatarId: role.avatarId, rank: role.rank ?? 1, kinds: role.kinds ?? capabilities[role.id] ?? [], instructions: role.detail, memory: role.memory?.trim().slice(0, 3000), permissions: role.permissions ?? noPermissions, provider: role.provider }));
  if (!agents.length) throw new Error('Assign at least one agent before starting a run.');
  return { id: teamId, name: teamName, agents, playbook: playbook.trim().slice(0, 3000), debate };
}

/**
 * Hard gate for the human apply path (App.tsx applyCodeChange): the same static secret scan runs before any manual
 * apply, quoting path:line. Returns the refusal notice when the change is flagged, or null when it is safe to apply.
 * A hard block by design: there is no override, so a flagged proposal can never reach the project folder by hand.
 */
export class RunEventRelay implements EventStore {
  private readonly inner = new PersistentRunEventStore();
  private run?: Run;
  constructor(private readonly onUpdate: (run: Run) => void) {}
  bind(run: Run) { this.run = run; }
  async append(event: Parameters<EventStore['append']>[0]) {
    const saved = await this.inner.append(event);
    if (this.run) {
      const snapshot = cloneRun(this.run);
      await saveRunSnapshot(snapshot);
      this.onUpdate(snapshot);
    }
    return saved;
  }
  read(runId: string, afterSeq?: number) { return this.inner.read(runId, afterSeq); }
}

function cloneRun(run: Run): Run { return JSON.parse(JSON.stringify(run)) as Run; }

type RunInput = {
  brief: string; roles: { id: string; label: string; detail: string; modelId?: string; avatarId?: number; rank?: number; permissions?: AgentPermissions; kinds?: Agent['kinds']; memory?: string; provider?: AgentProvider }[]; teamId?: string; teamName?: string; teamPlaybook?: string; planningDebate?: boolean; checkpointPolicy?: Run['checkpointPolicy']; maxConcurrency?: number; plugins?: PluginFlags; profile: ProviderProfile; projectRoot: string; mission?: RunMission; designReferenceUri?: string; designReferenceMime?: string; designAnnotations?: DesignAnnotation[];
  reviewCode: boolean; reviewImages: boolean; peerApprovalEnabled?: boolean; onPlanned?: (run: Run) => void; onUpdate: (run: Run) => void; signal?: AbortSignal;
};

export async function createPlannedRun(input: RunInput): Promise<Run> {
  const plugins = input.plugins ?? defaultPluginFlags;
  const team = makeTeam(input.roles, input.teamId, input.teamName, input.teamPlaybook, input.planningDebate);
  const image = input.designReferenceUri ? await readDesignReferenceImage(input.designReferenceUri) : undefined;
  const reference = image ? referenceImagePart(image) : undefined;
  const plan = await makePlan(input.profile, input.brief, team, input.signal, reference);
  const events = new RunEventRelay(input.onUpdate);
  const coordinator = new Coordinator(events, new ModelAgentExecutor(input.profile, input.projectRoot, plugins, reference), new ModelRunReviewer(input.profile, team, input.reviewCode, input.reviewImages, input.projectRoot, plugins, input.peerApprovalEnabled, undefined, async () => {}), { request: async () => undefined }, { maxConcurrency: input.maxConcurrency });
  const run = await coordinator.create(input.brief, team, plan);
  run.teamPlaybook = team.playbook; run.checkpointPolicy = input.checkpointPolicy ?? 'plan-only';
  run.projectRoot = input.projectRoot;
  run.mission = input.mission;
  run.designReferenceUri = input.designReferenceUri;
  run.designReferenceMime = input.designReferenceMime ?? image?.mimeType;
  run.designAnnotations = input.designAnnotations?.slice(0, 30);
  for (const note of plan.debateLog ?? []) {
    const separator = note.indexOf(':');
    run.messages.push({ id: `msg-${run.messages.length + 1}`, runId: run.id, from: separator > 0 ? note.slice(0, separator) : 'Planning critic', to: 'team', text: separator > 0 ? note.slice(separator + 1).trim() : note, kind: 'finding', createdAt: new Date().toISOString() });
  }
  events.bind(run); await saveRunSnapshot(run); input.onPlanned?.(cloneRun(run));
  return run;
}

export async function executePlannedRun(input: Omit<RunInput, 'brief' | 'onPlanned'> & { run: Run }): Promise<Run> {
  if (!['queued', 'cancelled', 'failed', 'needs-approval'].includes(input.run.status)) throw new Error('This run is not waiting to start or resume.');
  const plugins = input.plugins ?? defaultPluginFlags;
  // The run remembers the folder it was created against. The always-on worker runs in its own
  // folder, and its files have to be written there, not in the person's project.
  const projectRoot = input.run.projectRoot || input.projectRoot;
  const team = input.run.agentProfiles?.length
    ? { id: input.run.teamId, name: 'Saved run team', agents: input.run.agentProfiles, playbook: input.run.teamPlaybook }
    : makeTeam(input.roles.map(role => ({ ...role, modelId: input.run.agentModelIds?.[role.id] ?? role.modelId })), input.run.teamId, 'Saved run team', input.run.teamPlaybook);
  const events = new RunEventRelay(input.onUpdate);
  events.bind(input.run);
  const image = input.run.designReferenceUri ? await readDesignReferenceImage(input.run.designReferenceUri) : undefined;
  const reference = image ? referenceImagePart(image) : undefined;
  if (input.checkpointPolicy !== undefined) input.run.checkpointPolicy = input.checkpointPolicy; // coordinator reads the run, so an approve-time flip must reach it; omitted keeps the plan-time stamp
  const notes = input.run.steeringNotes ?? (input.run.steeringNotes = []);
  liveRunControls.set(input.run.id, async text => {
    if (!['running', 'reviewing'].includes(input.run.status)) return false;
    const at = new Date().toISOString();
    notes.push(text);
    const message = { id: `msg-${input.run.messages.length + 1}`, runId: input.run.id, from: 'You · live direction', to: 'team' as const, text, kind: 'update' as const, createdAt: at };
    input.run.messages.push(message); input.run.updatedAt = at;
    await events.append({ runId: input.run.id, type: 'agent.message', payload: message, at });
    return true;
  });
  const coordinator = new Coordinator(events, new ModelAgentExecutor(input.profile, projectRoot, plugins, reference), new ModelRunReviewer(input.profile, team, input.reviewCode, input.reviewImages, projectRoot, plugins, input.peerApprovalEnabled, undefined, async () => { await saveRunSnapshot(input.run); }), { request: async () => undefined }, { maxConcurrency: input.maxConcurrency });
  try { return await coordinator.execute(input.run, team, input.signal); }
  finally { liveRunControls.delete(input.run.id); clearGeneratedImages(); }
}

function referenceImagePart(reference?: { mimeType: string; base64: string }): ChatContentPart | undefined {
  return reference ? { type: 'image_url', image_url: { url: `data:${reference.mimeType};base64,${reference.base64}`, detail: 'high' } } : undefined;
}
