import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleProp, StyleSheet, Text, TextInput, View, ViewStyle } from 'react-native';
import { FocusPressable } from './Reveal';
import { DispatchIcon, type IconName } from './DispatchIcon';
import { copyText } from './clipboard';
import { colors, radius, space, type } from './theme';

/**
 * The shared component set.
 *
 * Every screen builds from these and nothing else, so the app reads as one system instead
 * of thirteen screens that each invented a button. The rules they hold:
 *
 * - Chrome is neutral. The lead colour is for content, not for controls. Button is the one
 *   exception: it carries the owner-specified web button palette (the button* tokens).
 * - One shape per tier: a control is a control radius, a card is a card radius.
 * - Every interactive thing has a disabled state that still looks like the thing.
 * - Every icon-only control carries an accessible name, and a tooltip where the icon is not
 *   universally understood.
 * - Nothing below 11px, and the type scale is the only source of sizes.
 */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'critical' | 'inverse';

/** The fill each button fades to when the pointer is on it. */
const HOVER_FILL: Record<ButtonVariant, string> = {
  primary: colors.buttonPrimaryHover,
  secondary: colors.surfaceActive,
  ghost: 'transparent',
  critical: colors.buttonCriticalHover,
  inverse: colors.surfaceActive,
};

export function Button({
  label,
  onPress,
  variant = 'secondary',
  disabled,
  icon,
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  style,
  testID,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  icon?: React.ReactNode;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: { expanded?: boolean; selected?: boolean; checked?: boolean; busy?: boolean };
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <FocusPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      // The fill fades to this colour and back. It is the control's own background, so the
      // radius holds and nothing moves under the pointer.
      hoverColour={HOVER_FILL[variant]}
      style={({ pressed }) => [
        styles.button,
        styles[`button_${variant}`],
        variant === 'ghost' && hovered && !disabled && styles.buttonGhostHover,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
        style,
      ]}
    >
      {icon}
      <Text style={[styles.buttonLabel, styles[`buttonLabel_${variant}`]]}>{label}</Text>
    </FocusPressable>
  );
}

export function IconButton({
  icon,
  onPress,
  accessibilityLabel,
  tooltip,
  disabled,
  style,
}: {
  icon: React.ReactNode;
  onPress: () => void;
  accessibilityLabel: string;
  /** The word for the control, shown when the pointer is on it. */
  tooltip?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <View style={styles.iconButtonWrap}>
      <FocusPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ disabled: !!disabled }}
        disabled={disabled}
        onPress={onPress}
        onHoverIn={() => setHovered(true)}
        onHoverOut={() => setHovered(false)}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        hoverColour={colors.surfaceActive}
        style={({ pressed }) => [styles.iconButton, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed, style]}
      >
        {icon}
      </FocusPressable>
      {tooltip && hovered ? <Text style={styles.tooltipLabel}>{tooltip}</Text> : null}
    </View>
  );
}

/**
 * The copy control.
 *
 * Copying is one of the things a person does with a result they cannot otherwise take away:
 * a file path, a diff, a run id, a total. The button says what it copied after the fact, so
 * the action is not silent, and it announces itself for a screen reader, because the visible
 * label change is not what a screen reader reads.
 *
 * The label is the confirmation: it says "Copied" for two seconds and then goes back to what
 * it was. A colour change alone would be invisible to anyone who cannot see the colour.
 */
export function CopyButton({
  text,
  label = 'Copy',
  subject,
  style,
}: {
  text: string;
  /** The words on the button before the copy: "Copy path". */
  label?: string;
  /** What was copied, named in the confirmation: "the file path". */
  subject: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const press = () => {
    if (!copyText(text)) {
      setState('failed');
      AccessibilityInfo.announceForAccessibility('Copy failed.');
    } else {
      setState('copied');
      AccessibilityInfo.announceForAccessibility(`Copied ${subject} to the clipboard.`);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState('idle'), 2000);
  };
  // The accessible name always contains the words on the button (WCAG 2.5.3), so a screen
  // reader hears "Copy path" and then "Copied the file path" rather than a name that no
  // longer matches the control.
  const word = state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label;
  const name = state === 'copied' ? `Copied ${subject}` : state === 'failed' ? 'Copy failed' : label;
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={name}
      tooltip={name}
      onPress={press}
      style={({ pressed }) => [styles.copyButton, pressed && styles.pressed, style]}
    >
      <DispatchIcon name={state === 'copied' ? 'check' : 'copy'} size={14} color={colors.textQuiet} />
      <Text style={[styles.copyButtonLabel, state === 'copied' && styles.copyButtonLabelCopied, state === 'failed' && styles.copyButtonLabelFailed]}>{word}</Text>
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

/**
 * The loading placeholder: a neutral block shaped like the content that is coming, at the
 * raised-surface fill and chip radius. It pulses while visible unless the system asks for
 * reduced motion; in the test environment it is a plain static view, and the animation is
 * always stopped when the block unmounts.
 */
export function Skeleton({ style, testID }: { style?: StyleProp<ViewStyle>; testID?: string }) {
  const isTest = process.env.NODE_ENV === 'test';
  const pulse = useRef(new Animated.Value(1)).current;
  const [reduceMotion, setReduceMotion] = useState(isTest);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (active) setReduceMotion(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (isTest || reduceMotion) { pulse.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.55, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [isTest, reduceMotion, pulse]);
  if (isTest || reduceMotion) return <View accessible={false} testID={testID} style={[styles.skeleton, style]} />;
  return <Animated.View accessible={false} testID={testID} style={[styles.skeleton, style, { opacity: pulse }]} />;
}

/** The design plan's delay: a skeleton appears after this long, not on the first paint. */
const SKELETON_DELAY_MS = 300;

/**
 * Shows a group of Skeleton blocks only once ctive has held for the delay. In the test
 * environment there are no timers, so the blocks render immediately when active.
 */
export function SkeletonGate({ active, children }: { active: boolean; children: React.ReactNode }) {
  const isTest = process.env.NODE_ENV === 'test';
  const [visible, setVisible] = useState(isTest && active);
  useEffect(() => {
    if (!active) { setVisible(false); return; }
    if (isTest) { setVisible(true); return; }
    const timer = setTimeout(() => setVisible(true), SKELETON_DELAY_MS);
    return () => clearTimeout(timer);
  }, [active, isTest]);
  return visible ? <View accessibilityRole="progressbar" accessibilityLabel="Loading">{children}</View> : null;
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
  sentence?: string;
  action?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.empty, style]}>
      {icon ? <View style={styles.emptyIcon}>{icon}</View> : null}
      <Text style={styles.emptyTitle}>{title}</Text>
      {sentence ? <Text style={styles.emptySentence}>{sentence}</Text> : null}
      {action ? <View style={styles.emptyAction}>{action}</View> : null}
    </View>
  );
}

/**
 * One toast slot, bottom right. Results of actions, errors and undo all live here, so the
 * app has a single place where something can interrupt and a single place to look for it.
 */
type ToastTone = 'neutral' | 'success' | 'attention' | 'critical';

/**
 * The mark each tone carries.
 *
 * The theme's own rule is that a state colour is always paired with a word, so a tone is
 * never carried by colour alone: every non-neutral notice names itself and shows a glyph.
 * A person who cannot see the colour still reads "Done", "Attention" or "Error", and the
 * three glyphs are different shapes, so the marks survive grayscale.
 */
const TOAST_MARK: Record<Exclude<ToastTone, 'neutral'>, { icon: IconName; word: string; colour: string }> = {
  success: { icon: 'check', word: 'Done', colour: colors.lead },
  attention: { icon: 'spark', word: 'Attention', colour: colors.attention },
  critical: { icon: 'warning', word: 'Error', colour: colors.critical },
};

export function Toast({
  title,
  body,
  action,
  tone = 'neutral',
  onDismiss,
  autoDismissMs,
  style,
  testID,
}: {
  title: string;
  body?: string;
  action?: React.ReactNode;
  tone?: ToastTone;
  onDismiss?: () => void;
  /** How long a non-critical notice stays before it dismisses itself. A failure never does. */
  autoDismissMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const mark = tone === 'neutral' ? null : TOAST_MARK[tone];
  const toneStyle = tone === 'critical' ? styles.toastCritical : tone === 'attention' ? styles.toastAttention : tone === 'success' ? styles.toastSuccess : styles.toastNeutral;
  const titleStyle = tone === 'critical' ? styles.toastTitleCritical : tone === 'attention' ? styles.toastTitleAttention : styles.toastTitle;
  // A notice that asks for nothing may leave on its own; a failure is not one of those, and
  // a notice nobody can dismiss cannot time out either.
  useEffect(() => {
    if (!autoDismissMs || tone === 'critical' || !onDismiss) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [autoDismissMs, tone, onDismiss]);
  return (
    <View testID={testID} style={[styles.toast, toneStyle, style]} accessibilityRole="alert">
      {mark ? <View style={styles.toastMark}>
        <DispatchIcon name={mark.icon} size={15} color={mark.colour} />
        <Text style={[styles.toastToneWord, { color: mark.colour }]}>{mark.word}</Text>
      </View> : null}
      <View style={styles.toastText}>
        <Text style={[styles.toastTitle, titleStyle]}>{title}</Text>
        {body ? <Text style={styles.toastBody}>{body}</Text> : null}
      </View>
      {action}
      {onDismiss ? (
        <IconButton icon={<DispatchIcon name="close" size={14} color={colors.textQuiet} />} accessibilityLabel="Dismiss notice" tooltip="Dismiss" onPress={onDismiss} style={styles.toastDismiss} />
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
    // Every interactive control is at least 44px on its primary axis: a 36px button is a
    // small target for a pointer and a worse one for a finger on a touch screen.
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  button_primary: { backgroundColor: colors.buttonPrimary, borderColor: colors.buttonPrimary },
  button_secondary: { backgroundColor: colors.surfaceRaised, borderColor: colors.line },
  button_ghost: { backgroundColor: 'transparent', borderColor: colors.line },
  button_critical: { backgroundColor: 'transparent', borderColor: colors.buttonCriticalBorder },
  // For a button that sits on the lead block, where a white button would not be legible.
  button_inverse: { backgroundColor: colors.page, borderColor: colors.page },
  // Ghost is the one variant whose hover is a border, not a fill.
  buttonGhostHover: { borderColor: colors.buttonGhostHoverBorder },
  // Disabled is opacity only (web .btn:disabled): the control keeps its own fill and shape,
  // so the row does not reflow when a control is switched off.
  buttonDisabled: { opacity: 0.45 },
  buttonLabel: { ...type.label },
  buttonLabel_primary: { color: colors.buttonPrimaryInk },
  buttonLabel_secondary: { color: colors.text },
  buttonLabel_ghost: { color: colors.textQuiet },
  buttonLabel_critical: { color: colors.buttonCritical },
  buttonLabel_inverse: { color: colors.lead },
  // Pressed scales the button (web .btn:active). The shared pressed style stays a dim for
  // rows, toggles and icon buttons.
  buttonPressed: { transform: [{ scale: 0.97 }] },
  pressed: { opacity: 0.82 },

  skeleton: { height: 14, minWidth: 24, borderRadius: radius.chip, backgroundColor: colors.surfaceRaised },

  // The copy control. It is a quiet outline control, not a filled one: it sits next to the
  // thing it copies and must not compete with the action on that thing.
  copyButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.line,
  },
  copyButtonLabel: { ...type.label, color: colors.textQuiet },
  copyButtonLabelCopied: { color: colors.text },
  copyButtonLabelFailed: { color: colors.critical },

  iconButton: {
    // The same 44px floor as the text controls: an icon button is the one control whose
    // whole size is its target.
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  iconButtonWrap: { alignItems: 'center', position: 'relative' },
  tooltipLabel: { position: 'absolute', bottom: '100%', right: 0, marginBottom: space.sm, paddingHorizontal: space.sm, paddingVertical: space.xs, borderRadius: radius.tag, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surfaceRaised, ...type.meta, color: colors.text },


  field: { gap: space.xs },
  fieldLabel: { ...type.label, color: colors.textQuiet },
  input: {
    minHeight: 44,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
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
  toggleDetail: { ...type.meta, color: colors.textMuted, marginTop: space.xs },
  toggleTrack: {
    width: 36,
    height: 20,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceActive,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
  },
  toggleTrackOn: { backgroundColor: colors.lineStrong, borderColor: colors.text },
  toggleThumb: { width: 14, height: 14, borderRadius: radius.pill, backgroundColor: colors.textQuiet },
  toggleThumbOn: { alignSelf: 'flex-end', backgroundColor: colors.page },

  chip: {
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
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
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  rowPressable: { paddingVertical: space.xs },
  rowText: { flex: 1 },
  rowTitle: { ...type.body, color: colors.text },
  rowDetail: { ...type.meta, color: colors.textMuted, marginTop: space.xs },
  rowValue: { ...type.code, color: colors.textQuiet },

  section: { gap: space.md },
  sectionHead: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  sectionText: { flex: 1 },
  sectionTitle: { ...type.section, color: colors.text },
  sectionSupporting: { ...type.bodySmall, color: colors.textQuiet, marginTop: space.xs },

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
  toastSuccess: { backgroundColor: colors.surfaceRaised, borderColor: colors.lead },
  toastAttention: { backgroundColor: colors.attentionSurface, borderColor: colors.attentionSurface },
  toastCritical: { backgroundColor: colors.criticalSurface, borderColor: colors.criticalSurface },
  toastMark: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  toastToneWord: { ...type.meta, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  toastText: { flex: 1 },
  toastTitle: { ...type.body, fontWeight: '600', color: colors.text },
  toastTitleAttention: { color: colors.attention },
  toastTitleCritical: { color: colors.critical },
  toastBody: { ...type.meta, color: colors.textQuiet, marginTop: space.xs },
  toastDismiss: { paddingHorizontal: space.sm, paddingVertical: space.xs },
});
