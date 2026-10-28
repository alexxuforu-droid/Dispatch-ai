import React from 'react';
import { Text } from 'react-native';
import { DispatchIcon, IconName } from '../../../DispatchIcon';
import { colors } from '../../../theme';
import { FocusPressable } from '../../../Reveal';
import { styles } from '../styles';

const NavItemImpl = React.memo(function NavItem({ label, icon, active, compact, onPress }: { label: string; icon: IconName; active: boolean; compact: boolean; onPress: () => void }) {
  // The label is the name of the control and the hint says what it does, so the item reads
  // the same in the compact rail, where the word is gone, and in the full sidebar.
  return <FocusPressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={`Open ${label}`} accessibilityState={{ selected: active }} tooltip={compact ? label : undefined} onPress={onPress} style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed, compact && styles.navItemCompact]}>
    <DispatchIcon name={icon} size={18} color={active ? colors.text : colors.textQuiet} />{!compact && <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>}
  </FocusPressable>;
});

export { NavItemImpl as NavItem };
