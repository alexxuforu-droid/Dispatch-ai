import React from 'react';
import { Text, View } from 'react-native';
import { FocusPressable } from '../../../Reveal';
import { styles } from '../styles';

const TopbarImpl = React.memo(function Topbar({ title, status, busy, cancelRequested, onCancel }: { title: string; status: string; busy: boolean; cancelRequested: boolean; onCancel: () => void }) {
  return <View style={styles.topbar}>
    <Text style={styles.topbarTitle}>{title}</Text>
    <View style={styles.topbarRight}>{busy ? <FocusPressable accessibilityRole="button" accessibilityLabel="Stop the current run" disabled={cancelRequested} onPress={onCancel} style={({ pressed }) => [styles.cancelRunButton, pressed && !cancelRequested && styles.pressed]}><Text style={styles.cancelRunText}>{cancelRequested ? 'Stopping…' : 'Stop run'}</Text></FocusPressable> : null}
      <Text style={styles.statusText}>{status}</Text>
    </View>
  </View>;
});

export { TopbarImpl as Topbar };
