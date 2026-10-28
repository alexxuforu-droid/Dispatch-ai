import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { Run } from '../../../orchestration/types';
import { FocusPressable } from '../../../Reveal';
import { RichMessage } from '../shared/RichMessage';
import { styles } from '../styles';

const ReviewCollectionImpl = React.memo(function ReviewCollection({ runs, onOpen }: { runs: Run[]; onOpen: (run: Run) => void }) {
  return <ScrollView style={styles.historyList} contentContainerStyle={styles.historyListContent}>{runs.map(run => {
    const reviewMessages = run.messages.filter(message => message.kind === 'finding' || message.from.toLowerCase().includes('reviewer'));
    return <View key={run.id} style={styles.runCard}><View style={styles.runCardHeader}><View style={styles.savedTeamIcon}><DispatchIcon name="reviews" size={19} color={colors.lead} /></View><View style={styles.flexOne}><Text style={styles.savedTeamName}>{run.status === 'needs-approval' ? 'Waiting for your decision' : run.status === 'completed' ? 'Automatic checks completed' : 'Review follows each work item'}</Text><Text style={styles.savedTeamMeta}>{new Date(run.createdAt).toLocaleString()}</Text></View></View><Text style={styles.runCardBrief}>{run.brief}</Text>{reviewMessages.length ? reviewMessages.map(message => <View key={message.id} style={styles.reviewResult}><Text style={styles.agentMessageName}>{message.from}</Text><RichMessage text={message.text} /></View>) : <Text style={styles.runCardMeta}>No review findings have been recorded for this run.</Text>}<FocusPressable accessibilityRole="button" onPress={() => onOpen(run)} style={({ pressed }) => [styles.savedTeamAction, pressed && styles.pressed]}><Text style={styles.savedTeamActionText}>Inspect run and review evidence</Text><Text style={styles.promptArrow}>↗</Text></FocusPressable></View>;
  })}</ScrollView>;
});

export { ReviewCollectionImpl as ReviewCollection };
