import React, { useState } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { FocusPressable } from './Reveal';
import { DispatchIcon } from './DispatchIcon';
import { colors, radius, space, type } from './theme';

/**
 * The shared component set.
 *
 * Every screen builds from these and nothing else, so the app reads as one system instead
 * of thirteen screens that each invented a button. The rules they hold:
 *
 * - Chrome is neutral. The lead colour is for content, not for controls.
 * - One shape per tier: a control is a control radius, a card is a card radius.
 * - Every interactive thing has a disabled state that still looks like the thing.
 * - Every icon-only control carries an accessible name, and a tooltip where the icon is not
 *   universally understood.
 * - Nothing below 11px, and the type scale is the only source of sizes.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'critical' | 'inverse';

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled,
  icon,
  accessibilityLabel,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <FocusPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        disabled && styles.buttonDisabled,
        hovered && !disabled && styles[`buttonHovered_${variant}`],
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.buttonLabel, styles[`buttonLabel_${variant}`], disabled && styles.buttonLabelDisabled]}>{label}</Text>
    </FocusPressable>
  );
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  disabled,
  style,
}: {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      style={({ pressed }) => [styles.iconButton, hovered && !disabled && styles.iconButtonHovered, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed, style]}
    >
      {icon}
    </FocusPressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  secure,
  autoCapitalize = 'none',
  multiline,
  accessibilityLabel,
  style,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  secure?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  multiline?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        testID={testID}
        accessibilityLabel={accessibilityLabel ?? label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        secureTextEntry={secure}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        multiline={multiline}
        style={[styles.input, error ? styles.inputError : null, multiline ? styles.inputMultiline : null]}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

export function Toggle({
  label,
  detail,
  value,
  onChange,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <FocusPressable
      accessibilityRole="switch"
      accessibilityLabel={detail ? `${label}: ${value ? 'on' : 'off'}` : label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
    >
      <View style={styles.toggleText}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {detail ? <Text style={styles.toggleDetail}>{detail}</Text> : null}
      </View>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleThumb, value && styles.toggleThumbOn]} />
      </View>
    </FocusPressable>
  );
}

/**
 * A chip is quiet by default: plain text on a neutral surface. Only a state that needs
 * attention gets a tint, so a screen full of chips still has one thing that stands out.
 */
export function Chip({
  label,
  attention,
  critical,
  style,
}: {
  label: string;
  attention?: boolean;
  critical?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = critical ? styles.chipCritical : attention ? styles.chipAttention : styles.chipQuiet;
  const labelStyle = critical ? styles.chipLabelCritical : attention ? styles.chipLabelAttention : styles.chipLabelQuiet;
  return (
    <View style={[styles.chip, tone, style]}>
      <Text style={[styles.chipLabel, labelStyle]}>{label}</Text>
    </View>
  );
}

/** A list row: text left, value right in monospace, one hairline below. */
export function Row({
  title,
  detail,
  value,
  trailing,
  onPress,
  accessibilityLabel,
}: {
  title: string;
  detail?: string;
  value?: string;
  trailing?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const content = (
    <>
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.rowTitle}>{title}</Text>
        {detail ? <Text numberOfLines={1} style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {trailing}
    </>
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, styles.rowPressable, pressed && styles.pressed]}
    >
      {content}
    </FocusPressable>
  );
}

/** A section title with an optional supporting line, an optional action and one hairline. */
export function Section({
  title,
  supporting,
  action,
  children,
  style,
}: {
  title: string;
  supporting?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionText}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {supporting ? <Text style={styles.sectionSupporting}>{supporting}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/**
 * The empty state: one sentence and the one action that fills it. No tinted square around
 * an icon, because that decoration says nothing the sentence does not already say.
 */
export function EmptyState({
  icon,
  title,
  sentence,
  action,
  style,
}: {
  icon?: React.ReactNode;
  title: string;
  sentence: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySentence}>{sentence}</Text>
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/**
 * One toast slot, bottom right. Results of actions, errors and undo all live here, so the
 * app has a single place where something can interrupt and a single place to look for it.
 */
export function Toast({
  title,
  body,
  action,
  tone = 'neutral',
  onDismiss,
  style,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  tone?: 'neutral' | 'attention' | 'critical';
  onDismiss?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const toneStyle = tone === 'critical' ? styles.toastCritical : tone === 'attention' ? styles.toastAttention : styles.toastNeutral;
  const titleStyle = tone === 'critical' ? styles.toastTitleCritical : tone === 'attention' ? styles.toastTitleAttention : styles.toastTitle;
  return (
    <View style={[styles.toast, toneStyle, style]} accessibilityRole="alert">
      <View style={styles.toastText}>
        <Text style={[styles.toastTitle, titleStyle]}>{title}</Text>
        {body ? <Text style={styles.toastBody}>{body}</Text> : null}
      </View>
      {action}
      {onDismiss ? (
        <IconButton icon={<DispatchIcon name="close" size={14} color={colors.textQuiet} />} accessibilityLabel="Dismiss notice" onPress={onDismiss} style={styles.toastDismiss} />
      ) : null}
    </View>
  );
}

/** The slot itself: one place, bottom right, so toasts never stack in different corners. */
export function ToastSlot({ children, style }: { children?: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  if (!children) return null;
  return <View style={[styles.toastSlot, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  button: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  button_primary: { backgroundColor: colors.text, borderColor: colors.text },
  button_secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.line },
  button_ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
  button_critical: { backgroundColor: colors.criticalSurface, borderColor: colors.criticalSurface },
  // For a button that sits on the lead block, where a white button would not be legible.
  button_inverse: { backgroundColor: colors.page, borderColor: colors.page },
  buttonDisabled: { backgroundColor: colors.surface, borderColor: colors.line },
  buttonHovered_primary: { backgroundColor: colors.textDim },
  buttonHovered_secondary: { backgroundColor: colors.surfaceActive, borderColor: colors.textMuted },
  buttonHovered_ghost: { backgroundColor: colors.surfaceActive },
  buttonHovered_critical: { backgroundColor: colors.criticalSurface, borderColor: colors.critical },
  buttonHovered_inverse: { backgroundColor: colors.surfaceActive },
  buttonLabel: { ...type.label },
  buttonLabel_primary: { color: colors.page },
  buttonLabel_secondary: { color: colors.text },
  buttonLabel_ghost: { color: colors.textQuiet },
  buttonLabel_critical: { color: colors.critical },
  buttonLabel_inverse: { color: colors.lead },
  buttonLabelDisabled: { color: colors.textMuted },
  pressed: { opacity: 0.82 },

  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  iconButtonHovered: { backgroundColor: colors.surfaceActive, borderColor: colors.line },

  field: { gap: space.xs },
  fieldLabel: { ...type.label, color: colors.textQuiet },
  input: {
    minHeight: 36,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 8,
    ...type.body,
  },
  inputMultiline: { minHeight: 84, textAlignVertical: 'top' },
  inputError: { borderColor: colors.critical },
  fieldError: { ...type.meta, color: colors.critical },
  fieldHint: { ...type.meta, color: colors.textMuted },

  toggleRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  toggleText: { flex: 1 },
  toggleLabel: { ...type.label, color: colors.text },
  toggleDetail: { ...type.meta, color: colors.textMuted, marginTop: 2 },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceActive,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleTrackOn: { backgroundColor: colors.text, borderColor: colors.text },
  toggleThumb: { width: 14, height: 14, borderRadius: radius.pill, backgroundColor: colors.textQuiet },
  toggleThumbOn: { alignSelf: 'flex-end', backgroundColor: colors.page },

  chip: {
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  chipQuiet: { backgroundColor: colors.surfaceRaised },
  chipAttention: { backgroundColor: colors.attentionSurface, borderColor: colors.attentionSurface },
  chipCritical: { backgroundColor: colors.criticalSurface, borderColor: colors.criticalSurface },
  chipLabel: { ...type.meta },
  chipLabelQuiet: { color: colors.textQuiet },
  chipLabelAttention: { color: colors.attention },
  chipLabelCritical: { color: colors.critical },

  row: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowPressable: { paddingVertical: space.xs },
  rowText: { flex: 1 },
  rowTitle: { ...type.body, color: colors.text },
  rowDetail: { ...type.meta, color: colors.textMuted, marginTop: 1 },
  rowValue: { ...type.code, color: colors.textQuiet },

  section: { gap: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  sectionText: { flex: 1 },
  sectionTitle: { ...type.section, color: colors.text },
  sectionSupporting: { ...type.bodySmall, color: colors.textQuiet, marginTop: 2 },

  empty: { alignItems: 'flex-start', gap: space.sm, paddingVertical: space.xxl },
  emptyIcon: { marginBottom: space.xs },
  emptyTitle: { ...type.section, color: colors.text },
  emptySentence: { ...type.bodySmall, color: colors.textQuiet, maxWidth: 420 },
  emptyAction: { marginTop: space.sm },

  toastSlot: { position: 'absolute', right: space.xxl, bottom: space.xxl, gap: space.sm, maxWidth: 360 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
  },
  toastNeutral: { backgroundColor: colors.surfaceRaised, borderColor: colors.line },
  toastAttention: { backgroundColor: colors.attentionSurface, borderColor: colors.attentionSurface },
  toastCritical: { backgroundColor: colors.criticalSurface, borderColor: colors.criticalSurface },
  toastText: { flex: 1 },
  toastTitle: { ...type.body, fontWeight: '600', color: colors.text },
  toastTitleAttention: { color: colors.attention },
  toastTitleCritical: { color: colors.critical },
  toastBody: { ...type.meta, color: colors.textQuiet, marginTop: 2 },
  toastDismiss: { paddingHorizontal: space.sm, paddingVertical: space.xs },
  toastDismissLabel: { ...type.meta, color: colors.textQuiet },
});

