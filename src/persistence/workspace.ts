import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AgentPermissions, RunMission } from '../orchestration/types';

export type BuiltinPluginFlags = { workspaceFiles: boolean; imageGeneration: boolean; codeReview: boolean; visualReview: boolean };
export type DispatchWorkflow = { id: string; name: string; description: string; brief: string; teamId?: string; mission?: RunMission };

const SETTINGS_KEY = 'dispatch.workspace.settings.v1';

export type WorkspaceSettings = {
  version: 4;
  teamRoleIds: string[];
  teams: { id: string; name: string; description: string; agentIds: string[]; playbook?: string }[];
  activeTeamId: string;
  customRoles: { id: string; label: string; detail: string; kinds: ('plan' | 'code' | 'image' | 'review')[] }[];
  agentAvatars: Record<string, number>;
  agentModels: Record<string, string>;
  agentPermissions: Record<string, AgentPermissions>;
  agentRanks: Record<string, number>;
  agentMemory: Record<string, string>;
  plugins: BuiltinPluginFlags;
  workflows: DispatchWorkflow[];
  planningDebate: boolean;
  checkpointPolicy: 'plan-only' | 'each-wave';
  /** Max wave items started at once; 0 means unlimited (today's behavior). */
  maxConcurrency?: number;
  peerApprovalEnabled: boolean;
  automaticCodeReview: boolean;
  automaticImageReview: boolean;
};

export const defaultAgentPermissions: AgentPermissions = { read: false, grep: false, write: false, edit: false };

export const defaultWorkspaceSettings: WorkspaceSettings = {
  version: 4,
  teamRoleIds: [],
  teams: [],
  activeTeamId: '',
  customRoles: [],
  agentAvatars: {},
  agentModels: {},
  agentPermissions: {},
  agentRanks: {},
  agentMemory: {},
  plugins: { workspaceFiles: true, imageGeneration: true, codeReview: true, visualReview: true },
  workflows: [],
  planningDebate: false,
  checkpointPolicy: 'plan-only',
  maxConcurrency: 0,
  // Default OFF. A higher-ranked agent auto-approving another agent's writes is the Kiro
  // bypass: a two-person gate defeated by an inherited permission. Here the "approver" is
  // another model whose only credential is a rank comparison, and it writes straight to disk
  // at model-runner.ts:416-427 with no human in the path. An explicit opt-in is the right
  // shape for that. The reader below still honours a stored `true`, so anyone who has already
  // chosen it keeps it.
  peerApprovalEnabled: false,
  automaticCodeReview: true,
  automaticImageReview: true,
};

export async function loadWorkspaceSettings(): Promise<WorkspaceSettings> {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) return defaultWorkspaceSettings;
  try {
    return readWorkspaceSettings(JSON.parse(raw));
  } catch {
    return defaultWorkspaceSettings;
  }
}

/** Pure reader for a parsed settings blob. Split out of loadWorkspaceSettings so the migration rules are testable without storage. */
export function readWorkspaceSettings(raw: unknown): WorkspaceSettings {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return defaultWorkspaceSettings;
  const value = raw as Record<string, unknown>;
  if (value.version !== 1 && value.version !== 2 && value.version !== 3 && value.version !== 4) return defaultWorkspaceSettings;
  {
    const teams = Array.isArray(value.teams) ? value.teams.flatMap(entry => {
      if (!entry || typeof entry !== 'object') return [];
      const team = entry as Record<string, unknown>;
      if (typeof team.id !== 'string' || !/^team-[a-z0-9-]{1,56}$/.test(team.id) || typeof team.name !== 'string' || !Array.isArray(team.agentIds)) return [];
      return [{ id: team.id, name: team.name.trim().slice(0, 60), description: typeof team.description === 'string' ? team.description.trim().slice(0, 240) : '', agentIds: [...new Set(team.agentIds.filter((id): id is string => typeof id === 'string'))].slice(0, 30), playbook: typeof team.playbook === 'string' ? team.playbook.trim().slice(0, 3000) : '' }];
    }).slice(0, 30) : [];
    return {
      version: 4,
      teamRoleIds: Array.isArray(value.teamRoleIds) ? value.teamRoleIds.filter(id => typeof id === 'string') : [],
      teams,
      activeTeamId: typeof value.activeTeamId === 'string' ? value.activeTeamId : '',
      agentMemory: value.agentMemory && typeof value.agentMemory === 'object' && !Array.isArray(value.agentMemory)
        ? Object.fromEntries(Object.entries(value.agentMemory).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([id, memory]) => [id, memory.trim().slice(0, 3000)]))
        : {},
      plugins: value.plugins && typeof value.plugins === 'object' && !Array.isArray(value.plugins)
        ? { workspaceFiles: (value.plugins as Record<string, unknown>).workspaceFiles !== false, imageGeneration: (value.plugins as Record<string, unknown>).imageGeneration !== false, codeReview: (value.plugins as Record<string, unknown>).codeReview !== false, visualReview: (value.plugins as Record<string, unknown>).visualReview !== false }
        : defaultWorkspaceSettings.plugins,
      workflows: Array.isArray(value.workflows) ? value.workflows.flatMap(entry => {
        if (!entry || typeof entry !== 'object') return [];
        const workflow = entry as Record<string, unknown>;
        if (typeof workflow.id !== 'string' || typeof workflow.name !== 'string' || typeof workflow.brief !== 'string') return [];
        const rawMission = workflow.mission && typeof workflow.mission === 'object' ? workflow.mission as Record<string, unknown> : undefined;
        const mission: RunMission | undefined = rawMission && typeof rawMission.id === 'string' && typeof rawMission.name === 'string' && ['image','code','mixed'].includes(String(rawMission.output)) ? { id: rawMission.id.slice(0,80), name: rawMission.name.slice(0,60), output: rawMission.output as RunMission['output'] } : undefined;
        return [{ id: workflow.id.slice(0, 80), name: workflow.name.trim().slice(0, 60), description: typeof workflow.description === 'string' ? workflow.description.trim().slice(0, 240) : '', brief: workflow.brief.trim().slice(0, 12000), teamId: typeof workflow.teamId === 'string' ? workflow.teamId.slice(0, 80) : undefined, mission }];
      }).filter(workflow => workflow.name && workflow.brief).slice(0, 50) : [],
      planningDebate: value.planningDebate === true,
      checkpointPolicy: value.checkpointPolicy === 'each-wave' ? 'each-wave' : 'plan-only',
      maxConcurrency: typeof value.maxConcurrency === 'number' && Number.isInteger(value.maxConcurrency) && value.maxConcurrency >= 0 && value.maxConcurrency <= 8 ? value.maxConcurrency : 0,
      // Only an explicit `true` arms peer auto-apply. `!== false` was wrong: settings blobs from
      // versions 1-3 (all still accepted at :65) never carried this field, so they parsed to
      // `undefined` and every upgraded install silently armed an agent that writes to disk with
      // no human in the path. Absent means absent, not opted-in.
      peerApprovalEnabled: value.peerApprovalEnabled === true,
      customRoles: Array.isArray(value.customRoles) ? value.customRoles.flatMap(entry => {
        if (!entry || typeof entry !== 'object') return [];
        const role = entry as Record<string, unknown>;
        if (typeof role.id !== 'string' || !/^custom-[a-z0-9-]{1,48}$/.test(role.id) || typeof role.label !== 'string' || typeof role.detail !== 'string' || !Array.isArray(role.kinds)) return [];
        const kinds = role.kinds.filter((kind): kind is 'plan' | 'code' | 'image' | 'review' => ['plan', 'code', 'image', 'review'].includes(String(kind)));
        if (!kinds.length) return [];
        return [{ id: role.id, label: role.label.trim().slice(0, 48), detail: role.detail.trim().slice(0, 240), kinds }];
      }).slice(0, 20) : [],
      agentAvatars: value.agentAvatars && typeof value.agentAvatars === 'object' && !Array.isArray(value.agentAvatars)
        ? Object.fromEntries(Object.entries(value.agentAvatars).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isInteger(entry[1]) && entry[1] >= 1 && entry[1] <= 200))
        : {},
      agentModels: value.agentModels && typeof value.agentModels === 'object' && !Array.isArray(value.agentModels)
        ? Object.fromEntries(Object.entries(value.agentModels).filter((entry): entry is [string, string] => typeof entry[1] === 'string').map(([id, model]) => [id, model.trim().slice(0, 120)]))
        : {},
      agentPermissions: value.agentPermissions && typeof value.agentPermissions === 'object' && !Array.isArray(value.agentPermissions)
        ? Object.fromEntries(Object.entries(value.agentPermissions).filter((entry): entry is [string, AgentPermissions] => {
          const permissions = entry[1];
          return !!permissions && typeof permissions === 'object' && ['read', 'grep', 'write', 'edit'].every(key => typeof (permissions as Record<string, unknown>)[key] === 'boolean');
        }).map(([id, permissions]) => [id, { read: permissions.read, grep: permissions.grep, write: permissions.write, edit: permissions.edit }]))
        : {},
      agentRanks: value.agentRanks && typeof value.agentRanks === 'object' && !Array.isArray(value.agentRanks)
        ? Object.fromEntries(Object.entries(value.agentRanks).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isInteger(entry[1]) && entry[1] >= 1 && entry[1] <= 5))
        : {},
      automaticCodeReview: typeof value.automaticCodeReview === 'boolean' ? value.automaticCodeReview : true,
      automaticImageReview: typeof value.automaticImageReview === 'boolean' ? value.automaticImageReview : true,
    };
  }
}

let writeQueue: Promise<void> = Promise.resolve();
export function saveWorkspaceSettings(settings: WorkspaceSettings): Promise<void> {
  const serialized = JSON.stringify(settings);
  writeQueue = writeQueue.catch(() => undefined).then(() => AsyncStorage.setItem(SETTINGS_KEY, serialized));
  return writeQueue;
}
