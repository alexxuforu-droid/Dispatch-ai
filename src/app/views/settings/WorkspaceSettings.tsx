import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { listProjectFiles, loadProjectRoot, ProjectEntry, readProjectText, selectProjectFolder } from '../../../persistence/workspaceProject';
import { FocusPressable } from '../../../Reveal';
import { styles } from '../styles';

const WorkspaceSettingsImpl = React.memo(function WorkspaceSettings({ onAddFileContext, onProjectRootChange }: { onAddFileContext: (path: string, content: string) => void; onProjectRootChange: (path: string) => void }) {
  const [root, setRoot] = useState('');
  const [path, setPath] = useState('');
  const [entries, setEntries] = useState<ProjectEntry[]>([]);
  const [selected, setSelected] = useState<ProjectEntry | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Choose a folder to browse project files. Browsing is read-only.');
  useEffect(() => { loadProjectRoot().then(saved => { setRoot(saved); onProjectRootChange(saved); if (saved) refresh(saved, ''); }).catch(() => setMessage('Could not load the saved project folder.')); }, [onProjectRootChange]);
  const refresh = async (folder: string, relative: string) => {
    setBusy(true); setMessage('Loading folder…');
    try { const listed = await listProjectFiles(folder, relative); setEntries(listed); setPath(relative); setMessage(listed.length ? `${listed.length} entries · read-only access` : 'This folder is empty.'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read this folder.'); }
    finally { setBusy(false); }
  };
  const chooseRoot = async () => {
    setBusy(true);
    try { const chosen = await selectProjectFolder(); if (chosen) { setRoot(chosen); onProjectRootChange(chosen); setSelected(null); setPreview(''); await refresh(chosen, ''); } }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not choose a project folder.'); }
    finally { setBusy(false); }
  };
  const openFile = async (entry: ProjectEntry) => {
    setBusy(true); setSelected(entry); setPreview('');
    try { const text = await readProjectText(root, entry.relativePath); setPreview(text); setMessage('UTF-8 text preview · read-only'); }
    catch (error) { setSelected(null); setMessage(error instanceof Error ? error.message : 'This file cannot be previewed.'); }
    finally { setBusy(false); }
  };
  return <View style={styles.workspaceBrowser}>
    <View style={styles.workspaceBrowserHead}><View style={styles.flexOne}><Text style={styles.settingsTitle}>Project files</Text><Text style={styles.settingsBody}>Browse a local folder and attach a text excerpt. Changes stay staged for you unless a qualified higher-ranked code reviewer approves them.</Text></View><Text style={styles.settingsStatus}>Project scoped</Text></View>
    <View style={styles.workspaceBrowserBar}><FocusPressable accessibilityRole="button" disabled={busy} onPress={chooseRoot} style={({ pressed }) => [styles.workspaceButton, pressed && styles.pressed]}><Text style={styles.workspaceButtonText}>{root ? 'Change folder' : 'Choose project folder'}</Text></FocusPressable><Text numberOfLines={1} style={styles.workspaceRoot}>{root || 'No folder selected'}</Text></View>
    {root ? <>
      <View style={styles.workspacePathRow}><Text numberOfLines={1} style={styles.workspacePath}>{path ? `${root}\\${path.split('/').join('\\')}` : root}</Text>{path ? <FocusPressable accessibilityRole="button" onPress={() => { const parent = path.split('/').slice(0, -1).join('/'); void refresh(root, parent); setSelected(null); }} style={styles.workspaceBack}><Text style={styles.workspaceButtonText}>Up one level</Text></FocusPressable> : null}</View>
      <ScrollView style={styles.workspaceEntries} nestedScrollEnabled>{entries.map(entry => <FocusPressable key={entry.relativePath} accessibilityRole="button" disabled={busy} onPress={() => { if (entry.type === 'directory') { setSelected(null); void refresh(root, entry.relativePath); } else { void openFile(entry); } }} style={({ pressed }) => [styles.workspaceEntry, pressed && styles.pressed]}><DispatchIcon name={entry.type === 'directory' ? 'files' : 'runs'} size={15} color={entry.type === 'directory' ? colors.lead : colors.textQuiet} /><Text numberOfLines={1} style={styles.workspaceEntryName}>{entry.name}</Text><Text style={styles.workspaceEntryMeta}>{entry.type === 'directory' ? 'Folder' : `${Math.ceil(entry.size / 1024)} KB`}</Text></FocusPressable>)}</ScrollView>
    </> : null}
    <Text style={styles.workspaceMessage}>{message}</Text>
    {selected ? <View style={styles.workspacePreview}><View style={styles.workspacePreviewHead}><Text numberOfLines={1} style={styles.workspaceEntryName}>{selected.relativePath}</Text><Text style={styles.workspaceEntryMeta}>PREVIEW</Text></View><ScrollView style={styles.workspacePreviewScroll}><Text selectable style={styles.workspacePreviewText}>{preview || (busy ? 'Reading file…' : '(empty file)')}</Text></ScrollView><FocusPressable accessibilityRole="button" disabled={busy} onPress={() => onAddFileContext(selected.relativePath, preview)} style={({ pressed }) => [styles.workspaceButton, styles.workspaceAttach, pressed && styles.pressed]}><Text style={styles.workspaceButtonText}>Add excerpt to task</Text></FocusPressable></View> : null}
  </View>;
});

export { WorkspaceSettingsImpl as WorkspaceSettings };
