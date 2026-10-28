import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { BuiltinPluginFlags } from '../../../persistence/workspace';
import { Chip, Toggle } from '../../../ui';
import { styles } from '../styles';

const PluginHomeImpl = React.memo(function PluginHome({ plugins, setPlugins }: { plugins: BuiltinPluginFlags; setPlugins: React.Dispatch<React.SetStateAction<BuiltinPluginFlags>> }) {
  const catalog: { id: keyof BuiltinPluginFlags; title: string; category: string; detail: string; status: string }[] = [
    { id: 'workspaceFiles', title: 'Project workspace', category: 'Files · read, search, stage', detail: 'Scoped file listing, read, grep, create, and exact-edit tools. Individual agent permissions still apply.', status: 'Local bridge' },
    { id: 'imageGeneration', title: 'Image generation', category: 'Media · generate', detail: 'Lets image agents use the configured image model and save generated output as a run artifact.', status: 'Provider required' },
    { id: 'codeReview', title: 'Code review', category: 'Quality · review', detail: 'Runs an independent model review of structured code changes before apply.', status: 'Provider required' },
    { id: 'visualReview', title: 'Visual review', category: 'Quality · image inspection', detail: 'Sends generated image pixels to the configured vision-capable chat model for review.', status: 'Vision model required' },
  ];
  return <ScrollView contentContainerStyle={styles.settingsPage}>
    <View style={styles.collectionTop}><Text style={styles.collectionBody}>Enable the built-in capabilities your teams need. Each switch turns a real capability on or off inside the run; file access still follows each agent’s permissions.</Text></View>
    <View style={styles.pluginGrid}>{catalog.map(plugin => <View key={plugin.id} style={styles.pluginCard}><Text style={styles.pluginCategory}>{plugin.category}</Text><Text style={styles.pluginTitle}>{plugin.title}</Text><Text style={styles.pluginBody}>{plugin.detail}</Text><View style={styles.pluginCardFooter}><Chip label={plugin.status} /><Toggle label={plugins[plugin.id] ? 'Enabled' : 'Disabled'} detail="Toggle this capability" value={plugins[plugin.id]} onChange={value => setPlugins(current => ({ ...current, [plugin.id]: value }))} /></View></View>)}</View>
    <View style={styles.pluginNotice}><Text style={styles.settingsSectionTitle}>Capability boundaries</Text><Text style={styles.settingsSectionBody}>Only Dispatch’s built-in, reviewed capabilities are available here. External plugin installation and arbitrary plugin code are not enabled. Disabled capabilities are blocked inside the run executor.</Text></View>
  </ScrollView>;
});

export { PluginHomeImpl as PluginHome };
