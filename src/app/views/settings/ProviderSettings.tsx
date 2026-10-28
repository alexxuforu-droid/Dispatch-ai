import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { clearProviderSecret, hasProviderSecret, saveProviderSecret } from '../../../persistence/providerCredentials';
import { defaultProviderProfile, loadProviderProfile, ProviderProfile, saveProviderProfile } from '../../../persistence/providerProfile';
import { normalizeProviderEndpoint, providerModelCatalog, refreshModelCatalog, testProviderConnection } from '../../../providers/openai-compatible';
import { rehydrateModelCatalog, saveCatalogSnapshot } from '../../../persistence/modelCatalogStore';
import { FocusPressable } from '../../../Reveal';
import { Field } from '../../../ui';
import { ConfirmDialog } from '../ConfirmDialog';
import { styles } from '../styles';

/** What is wrong with the endpoint, said next to the endpoint field. */
function endpointProblem(value: string): string | null {
  if (!value.trim()) return 'Enter the provider endpoint, for example https://api.openai.com/v1';
  try { normalizeProviderEndpoint(value); return null; }
  catch (error) {
    const message = error instanceof Error ? error.message : '';
    // The URL parser's own complaint is not something a person can act on, so the advice is
    // given instead. The provider's own rules are already written for the person.
    return /invalid url|not a valid/i.test(message) ? 'Enter a full URL, for example https://api.openai.com/v1' : message || 'This endpoint is not a valid provider URL.';
  }
}

const ProviderSettingsImpl = React.memo(function ProviderSettings({ onReady, onRemoved }: { onReady: () => void; onRemoved: () => void }) {
  const [profile, setProfile] = useState<ProviderProfile>(defaultProviderProfile);
  const [apiKey, setApiKey] = useState('');
  const [hasSavedKey, setHasSavedKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [suggestedModels, setSuggestedModels] = useState<string[]>([]);
  const [catalogCheckedAt, setCatalogCheckedAt] = useState<number | null>(null);
  const [catalogBusy, setCatalogBusy] = useState(false);
  // The two things that can be wrong with the form, each said next to the field it belongs
  // to. A toast that has already gone cannot be read next to the box that needs fixing.
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [removeKeyOpen, setRemoveKeyOpen] = useState(false);
  // normalizeProviderEndpoint throws on anything the endpoint field can hold mid-edit, and
  // this runs during render, where there is no error boundary above it. Defence in depth: with
  // `update` recomputing suggestions on every endpoint change, an unparseable endpoint also
  // re-nulls catalogCheckedAt, so render currently returns above and never reaches this. Kept
  // because it costs one try/catch and removes a whole class of crash if any future path sets
  // an endpoint without recomputing.
  const catalogStale = (() => {
    if (catalogCheckedAt === null) return false;
    try { return providerModelCatalog.freshness(normalizeProviderEndpoint(profile.endpoint), Date.now()).stale; }
    catch { return false; }
  })();
  const [status, setStatus] = useState('Settings are stored locally; the API key is kept in Windows Credential Locker.');
  // The endpoint the screen is currently pointing at. Async catalog work started for one
  // endpoint must not write its result onto another, so the value is tracked outside render
  // state where an await cannot leave it stale.
  const catalogEndpointRef = useRef(defaultProviderProfile.endpoint);
  const refreshModelSuggestions = (endpoint: string) => {
    try {
      setSuggestedModels(providerModelCatalog.lookup(normalizeProviderEndpoint(endpoint), Date.now()));
      setCatalogCheckedAt(providerModelCatalog.freshness(normalizeProviderEndpoint(endpoint), Date.now()).fetchedAt);
    } catch { setSuggestedModels([]); setCatalogCheckedAt(null); }
  };
  // Advisory only. It updates the suggestion list and the "last checked" note. It never
  // reads, rewrites or validates profile.model, and a failure here never blocks a save.
  const refreshCatalog = async () => {
    setCatalogBusy(true);
    const requested = profile;
    try {
      const { ids, fetchedAt } = await refreshModelCatalog(requested);
      // The endpoint may have been edited while this request was in flight. That response
      // describes a provider the user is no longer pointing at, so it is dropped rather than
      // shown beside a note that would then describe the wrong endpoint.
      if (catalogEndpointRef.current !== requested.endpoint) return;
      setSuggestedModels(ids);
      setCatalogCheckedAt(fetchedAt);
      await saveCatalogSnapshot(normalizeProviderEndpoint(requested.endpoint), ids, fetchedAt);
      setStatus(`Model list updated with ${ids.length} ${ids.length === 1 ? 'entry' : 'entries'}. Your saved model ID is unchanged.`);
    } catch (error) {
      setStatus(error instanceof Error ? `Could not refresh the model list: ${error.message}` : 'Could not refresh the model list.');
    } finally { setCatalogBusy(false); }
  };
  useEffect(() => {
    let active = true;
    // The credential check is allowed to fail on its own. A build without the Windows
    // Credential Locker must still restore the saved endpoint, model and catalog: folding the
    // check into the same Promise.all as the profile load meant one missing native module
    // threw away all three, and the screen showed an empty model even though one was saved.
    const secretCheck = hasProviderSecret('openai-compatible').then(
      hasSecret => ({ available: true, hasSecret }),
      () => ({ available: false, hasSecret: false }),
    );
    Promise.all([loadProviderProfile(), secretCheck, rehydrateModelCatalog(providerModelCatalog)]).then(([savedProfile, secret]) => {
      if (!active) return;
      setProfile(savedProfile); setHasSavedKey(secret.hasSecret);
      catalogEndpointRef.current = savedProfile.endpoint;
      refreshModelSuggestions(savedProfile.endpoint);
      setStatus(!secret.available
        ? 'Secure credential storage is unavailable. No API key has been saved.'
        : secret.hasSecret
          ? 'A provider key is saved. Test the connection to confirm it works.'
          : 'Settings are stored locally; the API key is kept in Windows Credential Manager.');
    }).catch(() => { if (active) setStatus('The saved provider settings could not be read on this device.'); });
    return () => { active = false; };
  }, []);
  const update = (key: keyof ProviderProfile, value: string) => {
    // Suggestions belong to the endpoint that produced them. Editing the endpoint recomputes
    // them from the cache for the new endpoint rather than clearing: clearing would leave the
    // previous provider's chips on screen AND throw away a listing that is already cached and
    // fresh for the endpoint just typed, forcing a pointless network round trip.
    if (key === 'endpoint') { catalogEndpointRef.current = value; refreshModelSuggestions(value); setEndpointError(endpointProblem(value)); }
    if (key === 'model') setKeyError(null);
    setProfile(current => ({ ...current, [key]: value }));
  };
  const connect = async () => {
    setBusy(true); setStatus('Saving securely and checking the provider…');
    setEndpointError(null); setKeyError(null);
    const problem = endpointProblem(profile.endpoint);
    if (problem) { setEndpointError(problem); setStatus('Fix the endpoint before the provider can be tested.'); setBusy(false); return; }
    try {
      const next = { ...profile, endpoint: normalizeProviderEndpoint(profile.endpoint), model: profile.model.trim(), imageModel: profile.imageModel.trim() };
      if (!next.model) throw new Error('Enter the model ID your provider supports.');
      if (apiKey.trim()) { await saveProviderSecret('openai-compatible', apiKey); setApiKey(''); setHasSavedKey(true); }
      await saveProviderProfile(next); setProfile(next);
      // next.endpoint is normalized, so it can differ from what update() last put in the ref
      // (trailing slash, host case). Without this the next Refresh compares the normalized
      // endpoint against a stale raw one and silently drops its own response.
      catalogEndpointRef.current = next.endpoint;
      await testProviderConnection(next);
      refreshModelSuggestions(next.endpoint);
      setStatus('Connected. The provider’s model endpoint responded successfully.');
      onReady();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Provider connection failed.';
      // The key and the endpoint have their own fields, so the failure is said there.
      if (/api key/i.test(message)) setKeyError(message);
      else if (endpointProblem(profile.endpoint)) setEndpointError(endpointProblem(profile.endpoint) as string);
      else setStatus(message);
    }
    finally { setBusy(false); }
  };
  const removeKey = async () => {
    setRemoveKeyOpen(false);
    setBusy(true);
    try { await clearProviderSecret('openai-compatible'); setHasSavedKey(false); setApiKey(''); setKeyError(null); setStatus('Saved provider key removed from Windows Credential Manager.'); onRemoved(); }
    catch (error) { setStatus(error instanceof Error ? error.message : 'Could not remove the saved key.'); }
    finally { setBusy(false); }
  };
  return <View style={styles.providerCard}>
    <View style={styles.providerCardHead}><View style={styles.flexOne}><Text style={styles.providerTitle}>Model provider</Text><Text style={styles.providerCaption}>OpenAI-compatible · OpenAI, OpenRouter, or a local endpoint</Text></View></View>
    <Field label="API endpoint" accessibilityLabel="OpenAI-compatible API endpoint" value={profile.endpoint} onChangeText={value => update('endpoint', value)} placeholder="https://api.openai.com/v1" error={endpointError ?? undefined} />
    <Field label="Model ID" accessibilityLabel="Provider model ID" value={profile.model} onChangeText={value => update('model', value)} placeholder="Enter a model supported by this endpoint" />
    <View style={styles.catalogRow}><Text style={styles.catalogNote}>{catalogCheckedAt === null ? 'Suggestions appear once the provider model list is fetched. Type any model ID above at any time.' : `Model list checked ${Math.max(0, Math.round((Date.now() - catalogCheckedAt) / 60000))} min ago.${catalogStale ? ' It may be out of date, refresh for an accurate list.' : ''} It only ever offers suggestions.`}</Text><FocusPressable accessibilityRole="button" accessibilityLabel="Refresh the provider model list" disabled={catalogBusy} onPress={refreshCatalog} style={({ pressed }) => [styles.catalogRefresh, catalogBusy && styles.catalogRefreshBusy, pressed && styles.pressed]}><Text numberOfLines={1} style={styles.catalogRefreshText}>{catalogBusy ? 'Refreshing…' : 'Refresh model list'}</Text></FocusPressable></View>
    {suggestedModels.length ? <View style={styles.modelSuggestions}>{suggestedModels.map(id => <FocusPressable key={id} accessibilityRole="radio" accessibilityLabel={`Use model ${id}`} accessibilityState={{ checked: profile.model === id }} onPress={() => update('model', id)} style={[styles.teamChip, styles.modelChip, profile.model === id && styles.teamChipActive]}><Text numberOfLines={1} style={[styles.teamChipText, profile.model === id && styles.teamChipTextActive]}>{id}</Text></FocusPressable>)}</View> : null}
    <Field label="Image-generation model (optional)" accessibilityLabel="Image-generation model ID" value={profile.imageModel} onChangeText={value => update('imageModel', value)} placeholder="Enter a model that supports image generation" hint="The chat model also needs image-input support for automatic visual review. Unsupported review stays pending for you." />
    <Field label={hasSavedKey ? 'API key · saved securely' : 'API key'} accessibilityLabel="Provider API key" value={apiKey} onChangeText={value => { setApiKey(value); setKeyError(null); }} secure placeholder={hasSavedKey ? 'Leave blank to keep the saved key' : 'Paste your provider API key'} error={keyError ?? undefined} />
    <View style={styles.providerFooter}><Text style={styles.providerStatus}>{status}</Text><View style={styles.providerButtons}>{hasSavedKey && <FocusPressable accessibilityRole="button" disabled={busy} onPress={() => setRemoveKeyOpen(true)} style={({ pressed }) => [styles.providerRemove, pressed && styles.pressed]}><Text style={styles.providerRemoveText}>Remove key</Text></FocusPressable>}<FocusPressable accessibilityRole="button" disabled={busy} onPress={connect} style={({ pressed }) => [styles.providerConnect, busy && styles.providerConnectBusy, pressed && styles.pressed]}><Text style={styles.providerConnectText}>{busy ? 'Checking…' : 'Save and test'}</Text></FocusPressable></View></View>
    <ConfirmDialog
      visible={removeKeyOpen}
      title="Remove the saved provider key?"
      body="The key is deleted from Windows Credential Manager. You will need to paste it again before a run can reach the provider."
      confirmLabel="Remove key"
      onConfirm={() => { void removeKey(); }}
      onCancel={() => setRemoveKeyOpen(false)}
    />
  </View>;
});

export { ProviderSettingsImpl as ProviderSettings };
