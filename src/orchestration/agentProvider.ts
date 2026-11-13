import { agentSecretId, WORKSPACE_SECRET_ID } from '../persistence/providerCredentials';
import { ProviderProfile } from '../persistence/providerProfile';
import { Agent, AgentProvider } from './types';

/**
 * The provider call one agent makes.
 *
 * The workspace profile is the base: one endpoint, one model, one key. An agent may bring its
 * own endpoint, its own model, its own image model and its own key, and each of those is
 * filled in only when the agent set it. Nothing is inherited by accident:
 *
 * - an agent with no provider of its own gets the workspace profile and the workspace key,
 *   except for the model id the agent already carries;
 * - an agent with a provider of its own keeps the workspace endpoint and model for whatever
 *   it left blank, and its own key only when it asked for one.
 *
 * The result names the credential slot, never the credential. The key itself is read at the
 * moment of the call, from Windows Credential Manager.
 */
export function resolveAgentProfile(base: ProviderProfile, agent?: Pick<Agent, 'id' | 'modelId' | 'provider'>): ProviderProfile {
  const own = agent?.provider;
  const model = agent?.modelId?.trim();
  if (!own) return model ? { ...base, model } : base;
  const endpoint = own.endpoint.trim() || base.endpoint;
  const ownModel = own.model.trim();
  const imageModel = own.imageModel.trim() || base.imageModel;
  const secretId = own.ownKey && agent?.id ? agentSecretId(agent.id) : (base.secretId ?? WORKSPACE_SECRET_ID);
  return {
    ...base,
    endpoint,
    model: ownModel || model || base.model,
    imageModel,
    secretId,
  };
}

/** Whether an agent carries anything of its own. Empty fields and the workspace key do not count. */
export function hasOwnProvider(provider?: AgentProvider): boolean {
  if (!provider) return false;
  return !!(provider.endpoint.trim() || provider.model.trim() || provider.imageModel.trim() || provider.ownKey);
}
