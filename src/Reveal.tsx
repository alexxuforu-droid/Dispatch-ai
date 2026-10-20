import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleProp, View, ViewStyle } from 'react-native';
import { colors } from './theme';

/**
 * Native entrance motion for newly arrived content.
 *
 * A run's messages and staged proposals arrive while the person is looking at the screen, so
 * they need a way to announce themselves. This is a short fade-and-rise, driven by the native
 * animation module on Windows, and it is skipped entirely when the person has asked the system
 * to reduce motion.
 *
 * The test environment renders the final state with no timers, so snapshots stay deterministic
 * and no animation is left running when a test ends.
 */
const DURATION = 190;
const RISE = 6;

export function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const isTest = process.env.NODE_ENV === 'test';
  const progress = useRef(new Animated.Value(isTest ? 1 : 0)).current;
  const [reduceMotion, setReduceMotion] = useState(isTest);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then(value => { if (active) setReduceMotion(value); })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (isTest || reduceMotion) { progress.setValue(1); return; }
    const animation = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [delay, isTest, progress, reduceMotion]);

  if (isTest) return <View style={style}>{children}</View>;
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [RISE, 0] }) }] }]}>{children}</Animated.View>;
}

/**
 * A visible focus ring for keyboard users. Windows draws no ring of its own on a Pressable,
 * so a focused control has to say so itself or keyboard navigation is invisible.
 */
export function useFocusRing() {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    focusProps: { onFocus: () => setFocused(true), onBlur: () => setFocused(false) },
  };
}

/**
 * A Pressable that shows where keyboard focus is. Windows leaves focus to the app, so a
 * control that is only distinguishable by its press state is invisible to keyboard users.
 *
 * The indicator is a colour change, never a size change: a control that already has a border
 * gets its border recoloured, and one without gets a lighter surface. Adding a border on focus
 * would grow the control by a few pixels and shift the layout under the keyboard user's hands.
 * The colour is picked from the control's own fill, so a filled accent button (a mint
 * background) gets a lighter mint and a dark surface gets the raised tone.
 */
export function FocusPressable({ children, style, onFocus, onBlur, focusIndicator = true, ...rest }: React.ComponentProps<typeof Pressable> & { focusIndicator?: boolean }) {
  const { focusProps, focused } = useFocusRing();
  return <Pressable
    {...rest}
    onFocus={(event) => { focusProps.onFocus(); onFocus?.(event); }}
    onBlur={(event) => { focusProps.onBlur(); onBlur?.(event); }}
    style={(state) => {
      const resolved = typeof style === 'function' ? style(state) : style;
      if (!focused || !focusIndicator) return resolved;
      const flat = (Array.isArray(resolved) ? resolved : [resolved]).filter(Boolean) as (Record<string, unknown> | undefined)[];
      const entries = flat.filter((entry): entry is Record<string, unknown> => Boolean(entry));
      const background = entries.map(entry => entry.backgroundColor).find(value => typeof value === 'string') as string | undefined;
      const onAccent = background?.toLowerCase() === colors.accent.toLowerCase();
      const hasBorder = entries.some(entry => typeof entry.borderWidth === 'number' && entry.borderWidth > 0);
      if (hasBorder) return [resolved, { borderColor: onAccent ? colors.accentInk : colors.accent }];
      // An absolutely positioned layer is a surface, not a control: painting it would cover
      // what is underneath, which is the opposite of helping the person see where they are.
      if (entries.some(entry => entry.position === 'absolute')) return resolved;
      return [resolved, { backgroundColor: onAccent ? colors.accentFocus : colors.raisedHover }];
    }}
  >{children}</Pressable>;
}