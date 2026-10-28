import React from 'react';
import { Modal, ScrollView, Text, View } from 'react-native';
import { DispatchIcon } from '../../../DispatchIcon';
import { agentAvatarIds } from '../../../agentAvatars';
import { colors } from '../../../theme';
import { FocusPressable, isEscapeEvent, keyHandlerProps, useInitialFocus } from '../../../Reveal';
import { AgentAvatar } from './AgentAvatar';
import { styles } from '../styles';

const AvatarPickerImpl = React.memo(function AvatarPicker({ visible, selected, onClose, onSelect, agentName }: { visible: boolean; selected: number; onClose: () => void; onSelect: (avatarId: number) => void; agentName?: string }) {
  // The dialog takes the keyboard when it opens, and Escape puts it away again.
  const dialogFocus = useInitialFocus<View>(visible);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.modalBackdrop} {...keyHandlerProps(event => { if (isEscapeEvent(event)) onClose(); })}>
    <View ref={dialogFocus} focusable accessibilityViewIsModal accessibilityLabel="Pick an avatar" style={styles.avatarModal}>
      <View style={styles.modalHeader}><View><Text style={styles.modalTitle}>Pick an avatar</Text></View><FocusPressable accessibilityRole="button" accessibilityLabel="Close avatar picker" onPress={onClose} style={styles.modalClose}><DispatchIcon name="close" size={17} color={colors.textQuiet} /></FocusPressable></View>
      <Text style={styles.modalBody}>{agentName ? `Choose the mark for ${agentName}. Your choice is saved on this device.` : 'Choose from the Dispatch logo collection. Your choice is saved on this device.'}</Text>
      <ScrollView style={styles.avatarGridScroll} contentContainerStyle={styles.avatarGrid}>{agentAvatarIds.map(id => <FocusPressable key={id} accessibilityRole="button" accessibilityLabel={`Use logo ${id} as avatar`} accessibilityState={{ selected: selected === id }} onPress={() => onSelect(id)} style={({ pressed }) => [styles.avatarOption, selected === id && styles.avatarOptionSelected, pressed && styles.pressed]}><AgentAvatar avatarId={id} size={55} name={agentName} /><Text style={[styles.avatarOptionNumber, selected === id && styles.avatarOptionNumberSelected]}>{String(id).padStart(3, '0')}</Text></FocusPressable>)}</ScrollView>
    </View></View>
  </Modal>;
});

export { AvatarPickerImpl as AvatarPicker };
