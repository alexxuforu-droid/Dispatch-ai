import React from 'react';
import { Text, View } from 'react-native';
import { styles } from '../styles';

const SettingsRowImpl = React.memo(function SettingsRow({ title, body, status }: { title: string; body?: string; status: string }) {
  return <View style={styles.settingsRow}><View style={styles.flexOne}><Text style={styles.settingsTitle}>{title}</Text>{body ? <Text style={styles.settingsBody}>{body}</Text> : null}</View><Text style={styles.settingsStatus}>{status}</Text></View>;
});

export { SettingsRowImpl as SettingsRow };
