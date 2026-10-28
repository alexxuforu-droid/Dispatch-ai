import React, { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { Artifact } from '../../../orchestration/types';
import { FocusPressable } from '../../../Reveal';
import { saveArtifactAs } from '../../../exporter';
import { NoticeReporter } from '../../controllers/types';
import { styles } from '../styles';

const ImageArtifactCardImpl = React.memo(function ImageArtifactCard({ artifact, onNotice }: { artifact: Artifact; onNotice: NoticeReporter }) {
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  if (artifact.kind !== 'image') return null;
  // The artifact folder belongs to the app, so the only way to get an image out of it is the
  // Windows save dialog. A cancelled dialog is a choice, not a failure, so it says nothing.
  const saveAs = async () => {
    setSaving(true);
    try {
      const saved = await saveArtifactAs(artifact.uri, artifact.name);
      if (saved) onNotice(`Saved ${artifact.name}.`, 'success');
    } catch (error) {
      onNotice(error instanceof Error ? error.message : 'The image could not be saved.', 'critical');
    } finally { setSaving(false); }
  };
  return <View style={styles.imageArtifact}>
    <View style={styles.imageArtifactHead}><Text numberOfLines={1} style={styles.imageArtifactName}>{artifact.name}</Text><Text style={styles.imageArtifactTag}>IMAGE</Text></View>
    {failed ? <View style={styles.imageArtifactFallback}><DispatchIcon name="files" size={22} color={colors.lead} /><Text style={styles.imageArtifactFallbackText}>Saved image · preview unavailable on this device</Text></View> : <Image source={{ uri: artifact.uri }} resizeMode="contain" onError={() => setFailed(true)} style={styles.imageArtifactPreview} />}
    <Text numberOfLines={1} style={styles.imageArtifactPath}>{artifact.uri}</Text>
    <FocusPressable accessibilityRole="button" accessibilityLabel={`Save ${artifact.name} as a file`} disabled={saving} onPress={() => { void saveAs(); }} style={({ pressed }) => [styles.savedTeamAction, pressed && styles.pressed]}><Text style={styles.savedTeamActionText}>{saving ? 'Saving…' : 'Save image as…'}</Text></FocusPressable>
  </View>;
});

export { ImageArtifactCardImpl as ImageArtifactCard };
