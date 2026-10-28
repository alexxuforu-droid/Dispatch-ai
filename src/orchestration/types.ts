import type { PluginFlags } from './plugins';

export type WorkKind = 'plan' | 'code' | 'image' | 'review';
export type AgentPermissions = { read: boolean; grep: boolean; write: boolean; edit: boolean };
export type RunStatus = 'queued' | 'running' | 'reviewing' | 'completed' | 'failed' | 'cancelled' | 'needs-approval';
export type CheckpointPolicy = 'plan-only' | 'each-wave';
export type AgentMessage = { id: string; runId: string; workItemId?: string; attempt?: number; from: string; to: string | 'team'; text: string; createdAt: string; kind: 'handoff' | 'question' | 'finding' | 'update' };
export type WorkItem = { id: string; title: string; kind: WorkKind; agentId: string; dependsOn: string[]; status: 'blocked' | 'ready' | 'running' | 'done' | 'failed' | 'cancelled' | 'needs-approval'; artifactIds: string[] };
export type Artifact = { id: string; runId: string; workItemId?: string; attempt?: number; kind: 'code-diff' | 'image' | 'report' | 'file'; name: string; uri: string; createdBy: string; supersededAt?: string; acceptedAt?: string; rejectedAt?: string };
export type CodeChange = { id: string; itemId: string; path: string; before: string; after: string; createOnly: boolean; createdBy: string; attempt: number; supersededAt?: string; rejectedAt?: string; appliedAt?: string; revertedAt?: string; approvedBy?: string; reviewOverride?: boolean };
export type DesignAnnotation = { id: string; x: number; y: number; note: string };
export type RunMission = { id: string; name: string; output: 'image' | 'code' | 'mixed' };
/**
 * The execution policy a run was created under.
 *
 * A run already snapshots the team, the playbook, the agent profiles and the model ids, but the
 * switches that decide how it executes were read from the live settings at approve time. A plan
 * created with peer auto-approval off could therefore be approved while the toggle was on, and
 * the saved run recorded no policy at all, so the history could not say which rules the run ran
 * under. The snapshot is what the run executes under. Runs saved before this field existed have
 * none, and fall back to the live settings, which is the only behaviour they ever had.
 */
export type RunPolicy = {
  peerApprovalEnabled: boolean;
  plugins: PluginFlags;
  reviewCode: boolean;
  reviewImages: boolean;
  maxConcurrency: number;
};
export type Run = { id: string; brief: string; status: RunStatus; teamId: string; mission?: RunMission; designReferenceUri?: string; designReferenceMime?: string; designAnnotations?: DesignAnnotation[]; steeringNotes?: string[]; teamPlaybook?: string; checkpointPolicy?: CheckpointPolicy; checkpointPaused?: boolean; policy?: RunPolicy; agentModelIds?: Record<string, string>; agentProfiles?: Agent[]; items: WorkItem[]; messages: AgentMessage[]; artifacts: Artifact[]; changes?: CodeChange[]; recoveredAt?: string; createdAt: string; updatedAt: string };
export type RunEvent = { seq: number; runId: string; at: string; type: 'run.created' | 'run.status' | 'work.ready' | 'work.started' | 'work.finished' | 'agent.message' | 'artifact.created' | 'code-change.proposed' | 'review.finding' | 'review.verdict' | 'approval.required' | 'human.decision'; payload: unknown };
export type Agent = { id: string; name: string; role: string; modelId?: string; avatarId?: number; rank: number; kinds: WorkKind[]; instructions: string; memory?: string; permissions: AgentPermissions };
export type Team = { id: string; name: string; agents: Agent[]; playbook?: string; debate?: boolean };
