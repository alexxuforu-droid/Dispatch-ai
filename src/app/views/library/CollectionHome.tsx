import React from 'react';
import { Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { Run } from '../../../orchestration/types';
import { FocusPressable } from '../../../Reveal';
import { Screen } from '../../types';
import { NoticeReporter } from '../../controllers/types';
import { ArtifactCollection } from './ArtifactCollection';
import { ReviewCollection } from './ReviewCollection';
import { styles } from '../styles';

/**
 * The library screens that hold finished work: review findings and artifacts.
 *
 * Teams and agents moved out of this file. They have their own screens now, and keeping a
 * second copy here meant two places to change when an agent gained a setting.
 */
const CollectionHomeImpl = React.memo(function CollectionHome({ screen, history, onCreate, onOpenRun, onNotice }: { screen: Screen; history: Run[]; onCreate: () => void; onOpenRun: (run: Run) => void; onNotice: NoticeReporter }) {
  const copy: Record<string, { body: string; action: string }> = {
    reviews: { body: 'Inspect code findings and image review gates before accepting a result.', action: 'Open latest review' },
    artifacts: { body: 'Images, proposals, and review reports stay linked to the run that produced them.', action: 'Start a run' },
  };
  const data = copy[screen] ?? copy.reviews;
  const hasArtifacts = history.some(item => item.artifacts.some(artifact => !artifact.supersededAt));
  return <View style={styles.collectionPage}>
    <View style={styles.collectionTop}>
      <Text style={styles.collectionBody}>{data.body}</Text>
      <FocusPressable accessibilityRole="button" onPress={onCreate} style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}><DispatchIcon name="plus" size={17} color={colors.leadInk} /><Text style={styles.primaryActionText}>{data.action}</Text></FocusPressable>
    </View>
    {screen === 'reviews' && history.length > 0 ? <ReviewCollection runs={history} onOpen={onOpenRun} />
      : screen === 'artifacts' && hasArtifacts ? <ArtifactCollection runs={history} onOpen={onOpenRun} onNotice={onNotice} />
      : null}
  </View>;
});

export { CollectionHomeImpl as CollectionHome };
