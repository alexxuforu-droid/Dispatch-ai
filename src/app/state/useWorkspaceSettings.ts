import { useCallback, useEffect, useMemo, useReducer, type SetStateAction } from 'react';
import {
  BuiltinPluginFlags,
  DispatchWorkflow,
  WorkspaceSettings,
  defaultAgentPermissions,
  defaultWorkspaceSettings,
  loadWorkspaceSettingsResult,
  saveWorkspaceSettings,
} from '../../persistence/workspace';
import { AgentPermissions, CheckpointPolicy } from '../../orchestration/types';
import { NoticeReporter } from '../controllers/types';
import { Role, SavedTeam, templates } from '../types';

type State = {
  /** The persisted shape. One object, one load, one save. */
  settings: WorkspaceSettings;
  /** The roles of the active team. */
  roles: Role[];
  /** The custom roles, with the glyph the picker needs. */
  customRoles: Role[];
  /** The load has settled, successfully or not. */
  ready: boolean;
  /** The load succeeded, so what is on screen may be written back. */
  writable: boolean;
};

type Patch = Partial<WorkspaceSettings> | ((current: WorkspaceSettings) => Partial<WorkspaceSettings>);

type Action =
  | { type: 'loaded'; settings: WorkspaceSettings }
  | { type: 'ready' }
  | { type: 'patch'; patch: Patch }
  | { type: 'roles'; roles: Role[] }
  | { type: 'activateTeam'; team: SavedTeam }
  | { type: 'addCustomRole'; role: Role };

const initialState: State = {
  settings: defaultWorkspaceSettings,
  roles: [],
  customRoles: [],
  ready: false,
  writable: false,
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'loaded': {
      const settings = action.settings;
      const customRoles = settings.customRoles.map(role => ({ ...role, glyph: 'build' as const }));
      const available = [...templates, ...customRoles];
      const migratedTeams: SavedTeam[] = settings.teams.length
        ? settings.teams
        : settings.teamRoleIds.length
          ? [{ id: 'team-default', name: 'Core team', description: 'Your original Dispatch agent team.', agentIds: settings.teamRoleIds }]
          : [];
      const selected = migratedTeams.find(team => team.id === settings.activeTeamId) ?? migratedTeams[0];
      const roles = available.filter(role => (selected?.agentIds ?? settings.teamRoleIds).includes(role.id));
      return {
        ...state,
        settings: { ...settings, version: 4, teams: migratedTeams, activeTeamId: selected?.id ?? '', teamRoleIds: roles.map(role => role.id) },
        customRoles,
        roles,
        writable: true,
      };
    }
    case 'ready':
      return state.ready ? state : { ...state, ready: true };
    case 'patch': {
      const patch = typeof action.patch === 'function' ? action.patch(state.settings) : action.patch;
      return { ...state, settings: { ...state.settings, ...patch } };
    }
    case 'roles':
      return { ...state, roles: action.roles, settings: { ...state.settings, teamRoleIds: action.roles.map(role => role.id) } };
    case 'activateTeam': {
      const available = [...templates, ...state.customRoles];
      const roles = available.filter(role => action.team.agentIds.includes(role.id));
      return { ...state, roles, settings: { ...state.settings, activeTeamId: action.team.id, teamRoleIds: roles.map(role => role.id) } };
    }
    case 'addCustomRole':
      return { ...state, customRoles: [...state.customRoles, action.role] };
  }
}

/**
 * Every persisted workspace setting, in one reducer.
 *
 * The settings used to be seventeen separate `useState` calls: one to declare each, one to load
 * each, one to repack each on save, and one more in the autosave dependency list. Adding one
 * meant four coordinated edits, and a missed dependency stopped the setting being persisted
 * without saying so. Here there is one object, one load and one save, so a new setting is one
 * field.
 *
 * The persisted shape is unchanged: version 4 with the same field names, so settings written by
 * an older build still load.
 */
export function useWorkspaceSettings(onNotice: NoticeReporter) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { settings, roles, customRoles, ready, writable } = state;

  useEffect(() => {
    let active = true;
    loadWorkspaceSettingsResult().then(result => {
      if (!active) return;
      // A corrupt blob is not a first run. The unreadable value has been kept aside under its
      // own key, and the person is told which one, so the defaults below are read as what
      // they are: a recovery, not the settings they saved.
      if (result.status === 'corrupt') {
        onNotice(`Workspace preferences could not be read. A copy of the unreadable file was kept as ${result.quarantineKey}.`, 'critical');
      }
      dispatch({ type: 'loaded', settings: result.value });
    }).catch(() => {
      if (active) onNotice('Workspace preferences could not be loaded. Your changes will still work for this session.', 'critical');
    }).finally(() => { if (active) dispatch({ type: 'ready' }); });
    return () => { active = false; };
  }, [onNotice]);

  useEffect(() => {
    if (!ready || !writable) return;
    const timer = setTimeout(() => {
      const persisted: WorkspaceSettings = {
        ...settings,
        version: 4,
        teamRoleIds: roles.map(role => role.id),
        customRoles: customRoles.map(({ id, label, detail, kinds }) => ({ id, label, detail, kinds })),
      };
      saveWorkspaceSettings(persisted).catch(() => onNotice('Could not save workspace preferences to this device.', 'critical'));
    }, 250);
    return () => clearTimeout(timer);
  }, [ready, writable, settings, roles, customRoles, onNotice]);

  const availableRoles = useMemo(() => [...templates, ...customRoles], [customRoles]);

  const patch = useCallback((next: Patch) => dispatch({ type: 'patch', patch: next }), []);
  const setRoles = useCallback((next: Role[]) => dispatch({ type: 'roles', roles: next }), []);
  const activateTeam = useCallback((team: SavedTeam) => dispatch({ type: 'activateTeam', team }), []);
  const addCustomRole = useCallback((role: Role) => dispatch({ type: 'addCustomRole', role }), []);

  const setSavedTeams = useCallback((next: SetStateAction<SavedTeam[]>) => {
    patch(current => ({ teams: typeof next === 'function' ? next(current.teams) : next }));
  }, [patch]);
  const setWorkflows = useCallback((next: SetStateAction<DispatchWorkflow[]>) => {
    patch(current => ({ workflows: typeof next === 'function' ? next(current.workflows) : next }));
  }, [patch]);
  const setPlugins = useCallback((next: SetStateAction<BuiltinPluginFlags>) => {
    patch(current => ({ plugins: typeof next === 'function' ? next(current.plugins) : next }));
  }, [patch]);
  const setActiveTeamId = useCallback((value: string) => patch({ activeTeamId: value }), [patch]);
  const setReviewCode = useCallback((value: boolean) => patch({ automaticCodeReview: value }), [patch]);
  const setReviewImages = useCallback((value: boolean) => patch({ automaticImageReview: value }), [patch]);
  const setPlanningDebate = useCallback((value: boolean) => patch({ planningDebate: value }), [patch]);
  const setCheckpointPolicy = useCallback((value: CheckpointPolicy) => patch({ checkpointPolicy: value }), [patch]);
  const setMaxConcurrency = useCallback((value: number) => patch({ maxConcurrency: value }), [patch]);
  const setPeerApprovalEnabled = useCallback((value: boolean) => patch({ peerApprovalEnabled: value }), [patch]);
  const setAgentModel = useCallback((id: string, value: string) => {
    patch(current => ({ agentModels: { ...current.agentModels, [id]: value } }));
  }, [patch]);
  const setAgentAvatar = useCallback((id: string, value: number) => {
    patch(current => ({ agentAvatars: { ...current.agentAvatars, [id]: value } }));
  }, [patch]);
  const setAgentRank = useCallback((id: string, value: number) => {
    patch(current => ({ agentRanks: { ...current.agentRanks, [id]: value } }));
  }, [patch]);
  const setAgentMemory = useCallback((id: string, value: string) => {
    patch(current => ({ agentMemory: { ...current.agentMemory, [id]: value.slice(0, 3000) } }));
  }, [patch]);
  const setAgentPermission = useCallback((id: string, key: keyof AgentPermissions, value: boolean) => {
    patch(current => ({ agentPermissions: { ...current.agentPermissions, [id]: { ...(current.agentPermissions[id] ?? defaultAgentPermissions), [key]: value } } }));
  }, [patch]);

  // A member leaves the team from the team card, without the editor. A team with no members
  // cannot plan anything, so that is refused with the reason.
  const removeRoleFromTeam = useCallback((roleId: string) => {
    const team = settings.teams.find(candidate => candidate.id === settings.activeTeamId);
    if (!team) { onNotice('There is no saved team to remove an agent from.', 'attention'); return; }
    const next = team.agentIds.filter(id => id !== roleId);
    if (!next.length) { onNotice('A team needs at least one agent. Edit the team to choose another one.', 'attention'); return; }
    const role = availableRoles.find(candidate => candidate.id === roleId);
    setSavedTeams(current => current.map(candidate => candidate.id === team.id ? { ...candidate, agentIds: next } : candidate));
    setRoles(availableRoles.filter(candidate => next.includes(candidate.id)));
    onNotice(`${role?.label ?? 'The agent'} removed from ${team.name}.`, 'success');
  }, [settings.teams, settings.activeTeamId, availableRoles, onNotice, setSavedTeams, setRoles]);

  return {
    ready,
    writable,
    settings,
    roles,
    setRoles,
    availableRoles,
    customRoles,
    addCustomRole,
    savedTeams: settings.teams,
    setSavedTeams,
    activeTeamId: settings.activeTeamId,
    setActiveTeamId,
    activateTeam,
    agentModels: settings.agentModels,
    setAgentModel,
    agentAvatars: settings.agentAvatars,
    setAgentAvatar,
    agentPermissions: settings.agentPermissions,
    setAgentPermission,
    agentRanks: settings.agentRanks,
    setAgentRank,
    agentMemory: settings.agentMemory,
    setAgentMemory,
    plugins: settings.plugins,
    setPlugins,
    workflows: settings.workflows,
    setWorkflows,
    planningDebate: settings.planningDebate,
    setPlanningDebate,
    checkpointPolicy: settings.checkpointPolicy,
    setCheckpointPolicy,
    maxConcurrency: settings.maxConcurrency ?? 0,
    setMaxConcurrency,
    peerApprovalEnabled: settings.peerApprovalEnabled,
    setPeerApprovalEnabled,
    reviewCode: settings.automaticCodeReview,
    setReviewCode,
    reviewImages: settings.automaticImageReview,
    setReviewImages,
    removeRoleFromTeam,
  };
}
