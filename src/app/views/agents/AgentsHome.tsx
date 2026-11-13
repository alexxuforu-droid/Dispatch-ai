import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { colors } from '../../../theme';
import { defaultAgentPermissions } from '../../../persistence/workspace';
import { agentSecretId, clearProviderSecret, hasProviderSecret, saveProviderSecret } from '../../../persistence/providerCredentials';
import { loadProviderProfile } from '../../../persistence/providerProfile';
import { fetchModelIds, normalizeProviderEndpoint } from '../../../providers/openai-compatible';
import { AgentPermissions, AgentProvider, AgentSetup, IdleBehaviour, Run } from '../../../orchestration/types';
import { defaultSandboxFolder, isSafeFolderName } from '../../../orchestration/sandbox';
import { FocusPressable } from '../../../Reveal';
import { Button, EmptyState, Section, Toggle } from '../../../ui';
import { Role, rankNames, sentenceCase } from '../../types';
import { NoticeReporter } from '../../controllers/types';
import { AgentAvatar } from '../pickers/AgentAvatar';
import { styles } from '../styles';

/** What an agent does when it has nothing to do, in the order it is offered. */
const IDLE_CHOICES: { id: IdleBehaviour; label: string }[] = [
  { id: 'anything', label: 'Whatever it wants' },
  { id: 'tool', label: 'A small tool' },
  { id: 'picture', label: 'A picture' },
  { id: 'report', label: 'A short report' },
  { id: 'game', label: 'A tiny game' },
];

const PERMISSION_DETAIL: Record<keyof AgentPermissions, string> = {
  read: 'Read files in the project.',
  grep: 'Search the project for text.',
  write: 'Propose new files.',
  edit: 'Propose changes to existing files.',
};

/** How long the always-on agent rests between turns. */
const REST_CHOICES = [1, 5, 15, 30];

const emptyProvider: AgentProvider = { endpoint: '', model: '', imageModel: '', ownKey: false };
const emptySetup: AgentSetup = { folder: '', idle: 'anything' };

/**
 * The agents screen: every agent, and everything about one agent.
 *
 * The list is on the left and the editor on the right at a normal window width, and the two
 * stack when the window is narrow. Each agent carries its own model, its own endpoint, its own
 * API key, its own folder and its own answer to "what do you do when there is nothing to do".
 */
const AgentsHomeImpl = React.memo(function AgentsHome({
  roles, agentModels, agentAvatars, agentPermissions, agentRanks, agentMemory, agentProviders, agentSetups,
  setAgentModel, setAgentPermission, setAgentRank, setAgentMemory, setAgentProvider, setAgentSetup,
  alwaysOn, onToggleAlwaysOn, alwaysOnAgentId, setAlwaysOnAgentId, alwaysOnMinutes, setAlwaysOnMinutes,
  onChooseAvatar, onCreate, onNotice, history,
}: {
  roles: Role[];
  agentModels: Record<string, string>;
  agentAvatars: Record<string, number>;
  agentPermissions: Record<string, AgentPermissions>;
  agentRanks: Record<string, number>;
  agentMemory: Record<string, string>;
  agentProviders: Record<string, AgentProvider>;
  agentSetups: Record<string, AgentSetup>;
  setAgentModel: (id: string, value: string) => void;
  setAgentPermission: (id: string, key: keyof AgentPermissions, value: boolean) => void;
  setAgentRank: (id: string, value: number) => void;
  setAgentMemory: (id: string, value: string) => void;
  setAgentProvider: (id: string, provider: AgentProvider | undefined) => void;
  setAgentSetup: (id: string, setup: AgentSetup | undefined) => void;
  /** Whether the always-on worker is running, and the switch that starts and stops it. */
  alwaysOn: boolean;
  onToggleAlwaysOn: () => void;
  /** The agent that works alone, and how long it rests between turns. */
  alwaysOnAgentId: string;
  setAlwaysOnAgentId: (id: string) => void;
  alwaysOnMinutes: number;
  setAlwaysOnMinutes: (minutes: number) => void;
  onChooseAvatar: (id: string) => void;
  onCreate: () => void;
  onNotice: NoticeReporter;
  history: Run[];
}) {
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? '');
  const [apiKey, setApiKey] = useState('');
  const [keySaved, setKeySaved] = useState(false);
  const [testState, setTestState] = useState<{ tone: 'idle' | 'good' | 'error'; text: string }>({ tone: 'idle', text: '' });

  const selected = roles.find(role => role.id === selectedId) ?? roles[0];
  const provider = selected ? agentProviders[selected.id] ?? emptyProvider : emptyProvider;
  const setup = selected ? agentSetups[selected.id] ?? emptySetup : emptySetup;
  const model = selected ? agentModels[selected.id] ?? '' : '';
  const ownKey = provider.ownKey;

  // The key lives in Windows Credential Manager. What the screen shows is whether one is
  // there, never the key itself.
  useEffect(() => {
    let active = true;
    if (!selectedId) { setKeySaved(false); return; }
    hasProviderSecret(agentSecretId(selectedId))
      .then(value => { if (active) setKeySaved(value); })
      .catch(() => { if (active) setKeySaved(false); });
    return () => { active = false; };
  }, [selectedId, ownKey]);

  useEffect(() => { setApiKey(''); setTestState({ tone: 'idle', text: '' }); }, [selectedId]);

  const work = useMemo(() => {
    if (!selected) return { done: 0, total: 0 };
    const items = history.flatMap(run => run.items).filter(item => item.agentId === selected.id);
    return { done: items.filter(item => item.status === 'done').length, total: items.length };
  }, [selected, history]);

  if (!selected) {
    return <View style={styles.agentsPage}>
      <EmptyState
        title="No agents yet"
        action={<Button label="Choose team roles" onPress={onCreate} variant="primary" />}
      />
    </View>;
  }

  const saveKey = async () => {
    const value = apiKey.trim();
    if (!value) return;
    try {
      await saveProviderSecret(agentSecretId(selected.id), value);
      setApiKey('');
      setKeySaved(true);
      setAgentProvider(selected.id, { ...provider, ownKey: true });
      onNotice(`Saved an API key for ${selected.label}. It is stored in Windows Credential Manager, not in the workspace file.`, 'success');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'The API key could not be saved.', 'critical');
    }
  };

  const removeKey = async () => {
    try {
      await clearProviderSecret(agentSecretId(selected.id));
      setKeySaved(false);
      setAgentProvider(selected.id, { ...provider, ownKey: false });
      onNotice(`Removed the API key for ${selected.label}.`, 'success');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'The API key could not be removed.', 'critical');
    }
  };

  const testConnection = async () => {
    setTestState({ tone: 'idle', text: 'Checking…' });
    try {
      const base = await loadProviderProfile();
      const endpoint = provider.endpoint.trim() ? normalizeProviderEndpoint(provider.endpoint) : base.endpoint;
      const secretId = provider.ownKey ? agentSecretId(selected.id) : undefined;
      const ids = await fetchModelIds({ ...base, endpoint, model: model || base.model, imageModel: provider.imageModel || base.imageModel, secretId });
      setTestState(ids.length
        ? { tone: 'good', text: `Connected. The provider lists ${ids.length} model${ids.length === 1 ? '' : 's'}.` }
        : { tone: 'error', text: 'The provider answered, but it listed no models. Check the endpoint and the key.' });
    } catch (error) {
      setTestState({ tone: 'error', text: error instanceof Error ? error.message : 'The provider could not be reached.' });
    }
  };

  const setIdle = (idle: IdleBehaviour) => setAgentSetup(selected.id, { folder: setup.folder, idle });
  const setFolder = (folder: string) => setAgentSetup(selected.id, { folder, idle: setup.idle });

  // The agent that works alone when always-on mode is on. An unset choice means the first
  // agent on the team, which is the same answer the worker itself uses.
  const worker = roles.find(role => role.id === alwaysOnAgentId) ?? roles[0];
  // The folder named here is the folder the worker will actually use. It comes from the same
  // function the worker uses, so this line cannot claim one folder while the turn writes into
  // another.

  return <View style={styles.agentsPage}>
    <ScrollView style={styles.flexOne} contentContainerStyle={styles.agentsEditorGrid}>
      <View style={styles.agentsAlwaysOn}>
        <Section title="Always-on mode">
          <Toggle
            label="Keep an agent working"
            value={alwaysOn}
            onChange={() => onToggleAlwaysOn()}
          />
          <View style={styles.agentsField}>
            <Text style={styles.fieldLabel}>Which agent works alone</Text>
            <View style={styles.agentsChoiceRow}>
              {roles.map(role => {
                const active = worker?.id === role.id;
                return <FocusPressable
                  key={role.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`${role.label} works alone in always-on mode`}
                  accessibilityState={{ checked: active }}
                  onPress={() => setAlwaysOnAgentId(role.id)}
                  style={({ pressed }) => [styles.agentsChoice, active && styles.agentsChoiceActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.agentsChoiceText, active && styles.agentsChoiceTextActive]}>{role.label}</Text>
                </FocusPressable>;
              })}
            </View>
          </View>
          <View style={styles.agentsField}>
            <Text style={styles.fieldLabel}>How long it rests between turns</Text>
            <View style={styles.agentsChoiceRow}>
              {REST_CHOICES.map(minutes => {
                const active = alwaysOnMinutes === minutes;
                return <FocusPressable
                  key={minutes}
                  accessibilityRole="radio"
                  accessibilityLabel={`Rest ${minutes} minute${minutes === 1 ? '' : 's'} between turns`}
                  accessibilityState={{ checked: active }}
                  onPress={() => setAlwaysOnMinutes(minutes)}
                  style={({ pressed }) => [styles.agentsChoice, active && styles.agentsChoiceActive, pressed && styles.pressed]}
                >
                  <Text style={[styles.agentsChoiceText, active && styles.agentsChoiceTextActive]}>{minutes} min</Text>
                </FocusPressable>;
              })}
            </View>
            
          </View>
        </Section>
      </View>

      <View style={styles.agentsList}>
        <Text style={styles.agentsEditorTitle}>Agents</Text>
        <Text style={styles.collectionBody}>{roles.length} on the team.</Text>
        <View style={styles.agentsListWrap}>
          {roles.map((role, index) => {
            const active = role.id === selected.id;
            const own = agentProviders[role.id];
            return <FocusPressable
              key={role.id}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${role.label}`}
              accessibilityState={{ selected: active }}
              onPress={() => setSelectedId(role.id)}
              style={({ pressed }) => [styles.agentsListItem, active && styles.agentsListItemActive, pressed && styles.pressed]}
            >
              <View style={styles.agentsHeader}>
                <AgentAvatar avatarId={agentAvatars[role.id] ?? index + 1} size={28} />
                <View style={styles.flexOne}>
                  <Text style={styles.agentsListName}>{role.label}</Text>
                  <Text style={styles.agentsListMeta}>{own?.ownKey ? 'Own key' : agentModels[role.id]?.trim() ? 'Own model' : 'Workspace defaults'}</Text>
                </View>
              </View>
            </FocusPressable>;
          })}
        </View>
      </View>

      <View style={styles.agentsEditor}>
        <View style={styles.agentsHeader}>
          <FocusPressable accessibilityRole="button" accessibilityLabel={`Choose ${selected.label} avatar`} onPress={() => onChooseAvatar(selected.id)} style={({ pressed }) => [pressed && styles.pressed]}>
            <AgentAvatar avatarId={agentAvatars[selected.id] ?? 1} size={56} />
          </FocusPressable>
          <View style={styles.flexOne}>
            <Text style={styles.agentsHeaderName}>{selected.label}</Text>
            <Text style={styles.collectionBody}>{selected.detail}</Text>
            <View style={styles.agentsFieldRow}>
              {selected.kinds.map(kind => <Text key={kind} style={styles.agentsKindChip}>{sentenceCase(kind)}</Text>)}
            </View>
            <Text style={styles.agentsHeaderMeta}>{work.done} of {work.total} assigned items finished.</Text>
          </View>
        </View>

        <View style={styles.agentsEditorCard}>
          <Section title="Model and provider">
            <View style={styles.agentsFieldRow}>
              <View style={[styles.agentsField, styles.flexOne]}>
                <Text style={styles.fieldLabel}>Model</Text>
                <TextInput
                  accessibilityLabel={`Model for ${selected.label}`}
                  value={model}
                  onChangeText={value => setAgentModel(selected.id, value)}
                  placeholder="Workspace default model"
                  placeholderTextColor={colors.textMuted}
                  style={styles.teamInput}
                />
              </View>
              <View style={[styles.agentsField, styles.flexOne]}>
                <Text style={styles.fieldLabel}>Image model</Text>
                <TextInput
                  accessibilityLabel={`Image model for ${selected.label}`}
                  value={provider.imageModel}
                  onChangeText={value => setAgentProvider(selected.id, { ...provider, imageModel: value })}
                  placeholder="Workspace default image model"
                  placeholderTextColor={colors.textMuted}
                  style={styles.teamInput}
                />
              </View>
            </View>
            <View style={styles.agentsField}>
              <Text style={styles.fieldLabel}>Endpoint</Text>
              <TextInput
                accessibilityLabel={`Endpoint for ${selected.label}`}
                value={provider.endpoint}
                onChangeText={value => setAgentProvider(selected.id, { ...provider, endpoint: value })}
                placeholder="Workspace default"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="none"
                style={styles.teamInput}
              />
              
            </View>
            <Toggle
              label="Use its own API key"
              value={ownKey}
              onChange={value => setAgentProvider(selected.id, { ...provider, ownKey: value })}
            />
            {ownKey ? <View style={styles.agentsField}>
              <Text style={styles.fieldLabel}>API key</Text>
              <TextInput
                accessibilityLabel={`API key for ${selected.label}`}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder={keySaved ? 'A key is saved. Type a new one to replace it.' : 'Paste the key'}
                placeholderTextColor={colors.textMuted}
                secureTextEntry
                style={styles.teamInput}
              />
              <View style={styles.agentsKeyRow}>
                <Button label="Save key" onPress={saveKey} disabled={!apiKey.trim()} variant="primary" />
                <Button label="Remove key" onPress={removeKey} disabled={!keySaved} variant="critical" />
                <Button label="Test connection" onPress={testConnection} />
              </View>
              <Text style={[styles.agentsStatus, testState.tone === 'error' && styles.agentsStatusError, testState.tone === 'good' && styles.agentsStatusGood]}>{testState.text || (keySaved ? 'A key is saved for this agent.' : 'No key is saved for this agent yet.')}</Text>
            </View> : null}
          </Section>
        </View>

        <View style={styles.agentsEditorCard}>
          <Section title="How it works on its own">
            <View style={styles.agentsField}>
              <Text style={styles.fieldLabel}>Its own folder</Text>
              <TextInput
                accessibilityLabel={`Folder for ${selected.label}`}
                value={setup.folder}
                onChangeText={setFolder}
                placeholder={defaultSandboxFolder(selected.label)}
                placeholderTextColor={colors.textMuted}
                style={styles.teamInput}
              />
              <Text style={[styles.agentsStatus, setup.folder.trim() && !isSafeFolderName(setup.folder) && styles.agentsStatusError]}>
                {setup.folder.trim() && !isSafeFolderName(setup.folder)
                  ? 'That folder name cannot be used. Use letters, numbers, spaces, dashes and underscores.'
                  : 'Leave it empty to use the shared Dispatch Agent Projects folder. Everything this agent makes stays inside that folder.'}
              </Text>
            </View>
            <View style={styles.agentsField}>
              <Text style={styles.fieldLabel}>When it has nothing to do</Text>
              <View style={styles.agentsChoiceRow}>
                {IDLE_CHOICES.map(choice => {
                  const active = setup.idle === choice.id;
                  return <FocusPressable
                    key={choice.id}
                    accessibilityRole="radio"
                    accessibilityLabel={`${selected.label} makes ${choice.label} when idle`}
                    accessibilityState={{ checked: active }}
                    onPress={() => setIdle(choice.id)}
                    style={({ pressed }) => [styles.agentsChoice, active && styles.agentsChoiceActive, pressed && styles.pressed]}
                  >
                    <Text style={[styles.agentsChoiceText, active && styles.agentsChoiceTextActive]}>{choice.label}</Text>
                  </FocusPressable>;
                })}
              </View>
              
            </View>
          </Section>
        </View>

        <View style={styles.agentsEditorCard}>
          <Section title="Capability">
            <View style={styles.agentsField}>
              <Text style={styles.fieldLabel}>Rank</Text>
              <View style={styles.agentRankRow}>
                {rankNames.map((name, index) => {
                  const active = (agentRanks[selected.id] ?? 1) === index + 1;
                  return <FocusPressable
                    key={name}
                    accessibilityRole="radio"
                    accessibilityLabel={`Set ${selected.label} rank to ${name}`}
                    accessibilityState={{ checked: active }}
                    onPress={() => setAgentRank(selected.id, index + 1)}
                    style={[styles.agentRankOption, active && styles.agentRankOptionActive]}
                  >
                    <Text style={[styles.agentRankText, active && styles.agentRankTextActive]}>{index + 1}</Text>
                  </FocusPressable>;
                })}
              </View>
            </View>
            <View style={styles.agentsField}>
              <Text style={styles.fieldLabel}>Tools</Text>
              {(['read', 'grep', 'write', 'edit'] as (keyof AgentPermissions)[]).map(key => (
                <Toggle
                  key={key}
                  label={sentenceCase(key)}
                  detail={PERMISSION_DETAIL[key]}
                  value={(agentPermissions[selected.id] ?? defaultAgentPermissions)[key]}
                  onChange={value => setAgentPermission(selected.id, key, value)}
                />
              ))}
            </View>
            <View style={styles.agentsField}>
              <Text style={styles.fieldLabel}>Memory</Text>
              <TextInput
                accessibilityLabel={`Memory for ${selected.label}`}
                value={agentMemory[selected.id] ?? ''}
                onChangeText={value => setAgentMemory(selected.id, value)}
                placeholder="What this agent should remember between runs"
                placeholderTextColor={colors.textMuted}
                multiline
                style={[styles.teamInput, styles.agentsMemoryInput]}
              />
            </View>
          </Section>
        </View>
      </View>
    </ScrollView>
  </View>;
});

export { AgentsHomeImpl as AgentsHome };
