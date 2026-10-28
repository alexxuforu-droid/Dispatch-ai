import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Run } from '../../../orchestration/types';
import { FocusPressable } from '../../../Reveal';
import { relativeTime } from '../../../relativeTime';
import { NoticeReporter } from '../../controllers/types';
import { ImageArtifactCard } from './ImageArtifactCard';
import { styles } from '../styles';

const ArtifactCollectionImpl = React.memo(function ArtifactCollection({ runs, onOpen, onNotice }: { runs: Run[]; onOpen: (run: Run) => void; onNotice: NoticeReporter }) {
  const artifacts = runs.flatMap(run => run.artifacts.filter(artifact => !artifact.supersededAt).map(artifact => ({ run, artifact }))).reverse();
  return <ScrollView style={styles.historyList} contentContainerStyle={styles.artifactGallery}>{artifacts.map(({ run, artifact }) => <View key={artifact.id} style={styles.artifactGalleryItem}><ImageArtifactCard artifact={artifact} onNotice={onNotice} /><Text selectable style={styles.artifactRunMeta}>{relativeTime(run.createdAt)} · {run.brief}</Text><FocusPressable accessibilityRole="button" onPress={() => onOpen(run)} style={({ pressed }) => [styles.savedTeamAction, pressed && styles.pressed]}><Text style={styles.savedTeamActionText}>Open the run and its review</Text><Text style={styles.promptArrow}>↗</Text></FocusPressable></View>)}</ScrollView>;
});

export { ArtifactCollectionImpl as ArtifactCollection };
