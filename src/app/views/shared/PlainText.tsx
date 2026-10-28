import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../styles';

const PlainTextImpl = React.memo(function PlainText({ text }: { text: string }) {
  const lines = text.trim().split('\n');
  return <View>{lines.map((line, index) => {
    const heading = line.match(/^#{1,3}\s+(.+)/);
    const bullet = line.match(/^\s*[-*]\s+(.+)/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)/);
    if (!line.trim()) return <View key={index} style={styles.paragraphGap} />;
    if (heading) return <Text key={index} style={styles.markdownHeading}>{heading[1]}</Text>;
    if (bullet) return <View key={index} style={styles.markdownListItem}><View style={styles.markdownBullet} /><Text selectable style={styles.agentMessageText}>{bullet[1]}</Text></View>;
    if (numbered) return <View key={index} style={styles.markdownListItem}><Text style={styles.markdownNumber}>{line.match(/^\s*\d+/)?.[0]}</Text><Text selectable style={styles.agentMessageText}>{numbered[1]}</Text></View>;
    return <Text key={index} selectable style={styles.agentMessageText}>{line}</Text>;
  })}</View>;
});

export { PlainTextImpl as PlainText };
