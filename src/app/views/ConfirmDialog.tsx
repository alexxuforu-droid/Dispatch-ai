import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { FocusPressable, isEscapeEvent, keyHandlerProps, useInitialFocus } from '../../Reveal';
import { colors, radius, space, type } from '../../theme';
import { Button } from '../../ui';

/**
 * One confirmation dialog for every destructive action.
 *
 * The rules it holds, so no screen has to invent its own:
 *   - the dialog names the action in its own words ("Delete team", "Remove key"), never a
 *     bare "OK";
 *   - Escape closes it without doing anything, because a dialog that cannot be dismissed
 *     traps the person inside it;
 *   - the confirm button takes the keyboard focus when the dialog opens, so the next key
 *     press lands on the action that was just offered;
 *   - a destructive confirmation is tinted with the critical colour and a neutral one is
 *     not, so the difference is visible before the button is pressed.
 */
export function ConfirmDialog({ visible, title, body, confirmLabel, cancelLabel = 'Cancel', destructive = true, onConfirm, onCancel }: {
  visible: boolean;
  title: string;
  body?: string;
  /** The action, in the words the person would use for it. */
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmFocus = useInitialFocus<View>(visible);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <View style={styles.backdrop} {...keyHandlerProps(event => { if (isEscapeEvent(event)) onCancel(); })}>
      <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert">
        <Text style={styles.title}>{title}</Text>
        {body ? <Text style={styles.body}>{body}</Text> : null}
        <View style={styles.actions}>
          <Button label={cancelLabel} onPress={onCancel} variant="secondary" />
          <FocusPressable
            ref={confirmFocus}
            focusable
            accessibilityRole="button"
            accessibilityLabel={confirmLabel}
            onPress={onConfirm}
            style={({ pressed }) => [styles.confirm, !destructive && styles.confirmNeutral, pressed && styles.pressed]}
          >
            <Text style={[styles.confirmText, !destructive && styles.confirmTextNeutral]}>{confirmLabel}</Text>
          </FocusPressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'center', alignItems: 'center', padding: space.xl },
  dialog: { width: '100%', maxWidth: 480, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: radius.card, padding: space.xl, gap: space.md },
  title: { ...type.section, color: colors.text },
  body: { ...type.bodySmall, color: colors.textQuiet },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  confirm: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.control, backgroundColor: colors.criticalSurface },
  confirmNeutral: { backgroundColor: colors.lead },
  confirmText: { ...type.label, color: colors.critical },
  confirmTextNeutral: { color: colors.leadInk },
  pressed: { opacity: 0.82 },
});
