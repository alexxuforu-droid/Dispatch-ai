import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { PlainText } from './PlainText';
import { styles } from '../styles';

const RichMessageImpl = React.memo(function RichMessage({ text }: { text: string }) {
  const pattern = /```([^\r\n]*)\r?\n([\s\S]*?)```/g;
  const blocks: { type: 'text' | 'code'; value: string; language?: string }[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? cursor;
    if (start > cursor) blocks.push({ type: 'text', value: text.slice(cursor, start) });
    blocks.push({ type: 'code', value: match[2].replace(/\n$/, ''), language: match[1].trim() || 'code' });
    cursor = start + match[0].length;
  }
  if (cursor < text.length) blocks.push({ type: 'text', value: text.slice(cursor) });
  return <View style={styles.richMessage}>{blocks.map((block, index) => block.type === 'code'
    ? <View key={index} style={styles.codeBlock}><View style={styles.codeHeader}><Text style={styles.codeLanguage}>{block.language}</Text><Text style={styles.codeLineCount}>{block.value.split('\n').length} lines</Text></View><ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.codeScroll}><Text selectable style={styles.codeText}>{block.value}</Text></ScrollView></View>
    : <PlainText key={index} text={block.value} />)}</View>;
});

export { RichMessageImpl as RichMessage };
