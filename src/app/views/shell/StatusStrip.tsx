import React from 'react';
import { Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { FocusPressable } from '../../../Reveal';
import { styles } from '../styles';

/**
 * The strip along the bottom of the window. The shell has no top bar, so the always-on
 * switch and the run controls live here instead: still one row, still visible from any
 * screen.
 */
const StatusStripImpl = React.memo(function StatusStrip({ status, busy, cancelRequested, onCancel, alwaysOn, alwaysOnDetail, onToggleAlwaysOn }: { status: string; busy: boolean; cancelRequested: boolean; onCancel: () => void; alwaysOn: boolean; alwaysOnDetail: string; onToggleAlwaysOn: () => void }) {
  return <View style={styles.statusStrip}>
    <View style={styles.statusStripRight}>
      {/* The always-on switch is a mode, not a setting: it decides what happens while the
          app is open, and it has to be visible from any screen. */}
      <FocusPressable
        accessibilityRole="switch"
        accessibilityLabel="Always-on mode"
        
        accessibilityState={{ checked: alwaysOn }}
        onPress={onToggleAlwaysOn}
        style={({ pressed }) => [styles.alwaysOnButton, alwaysOn && styles.alwaysOnButtonOn, pressed && styles.pressed]}
      >
        <DispatchIcon name="infinity" size={15} color={alwaysOn ? colors.lead : colors.textQuiet} />
        <Text style={[styles.alwaysOnText, alwaysOn && styles.alwaysOnTextOn]} numberOfLines={1}>{alwaysOn ? `Always on · ${alwaysOnDetail}` : 'Always on'}</Text>
      </FocusPressable>
      {busy ? <FocusPressable accessibilityRole="button" accessibilityLabel="Stop the current run" disabled={cancelRequested} onPress={onCancel} style={({ pressed }) => [styles.cancelRunButton, pressed && !cancelRequested && styles.pressed]}><Text style={styles.cancelRunText}>{cancelRequested ? 'Stopping…' : 'Stop run'}</Text></FocusPressable> : null}
      <Text style={styles.statusText} numberOfLines={1}>{status}</Text>
    </View>
  </View>;
});

export { StatusStripImpl as StatusStrip };
