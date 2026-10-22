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
 * The colour is picked from the control's own fill: the ink on the lead block, the
 * page colour on a light fill, and the lead colour on a dark surface. A control that
 * carries a border has its border recoloured, which costs no reflow; one that does not
 * is given a transparent border to recolour.
 */
/** The light fills in the app. A focus ring has to be dark on these. */
const LIGHT_FILLS = [colors.text, colors.lead, colors.pop].map(value => value.toLowerCase());

/** The pressable is wrapped so the fill can be animated. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * React Native can only interpolate a colour written as rgba, so a hex is converted before it
 * is used as the start of a fade. Without this the fade produces a broken colour and the
 * control picks up an outline it should not have.
 */
const toRgba = (colour: string): string => {
  if (colour.toLowerCase() === 'transparent') return 'rgba(0, 0, 0, 0)';
  if (!colour.startsWith('#')) return colour;
  const hex = colour.slice(1);
  const full = hex.length === 3 ? hex.split('').map(part => part + part).join('') : hex;
  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);
  const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export function FocusPressable({ children, style, onFocus, onBlur, onPressIn, onPressOut, focusIndicator = true, hoverColour, ...rest }: React.ComponentProps<typeof Pressable> & { focusIndicator?: boolean; hoverColour?: string }) {
  const { focusProps, focused } = useFocusRing();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(lift, {
      toValue: hovered ? 1 : 0,
      duration: 120,
      easing: Easing.out(Easing.quad),
      // A background colour is not something the native driver can animate, so this one runs
      // on the JavaScript driver. It is one value on one control.
      useNativeDriver: false,
    }).start();
  }, [hovered, lift]);

  // The press state is tracked here rather than read from the Pressable, because the style has
  // to be a plain array for the animated fill to resolve.
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  const flat = (Array.isArray(resolved) ? resolved : [resolved]).filter(Boolean) as (Record<string, unknown> | undefined)[];
  const entries = flat.filter((entry): entry is Record<string, unknown> => Boolean(entry));
  const background = entries.map(entry => entry.backgroundColor).find(value => typeof value === 'string') as string | undefined;
  const baseFill = toRgba(background ?? 'transparent');
  const onAccent = background?.toLowerCase() === colors.lead.toLowerCase();
  const onLight = background ? LIGHT_FILLS.includes(background.toLowerCase()) : false;
  const hasBorder = entries.some(entry => typeof entry.borderWidth === 'number' && entry.borderWidth > 0);
  // The ring follows the fill it sits on: the ink on the lead block, the page colour on a
  // light fill, and the lead colour on a dark surface.
  const ring = onAccent ? colors.leadInk : onLight ? colors.page : colors.lead;
  // The fill fades to the hover colour and back. It is the control's own background, so it
  // keeps the control's own radius and nothing moves.
  const fill = lift.interpolate({ inputRange: [0, 1], outputRange: [baseFill, toRgba(hoverColour ?? 'rgba(255,255,255,0.10)')] });
  // An absolutely positioned layer is a surface, not a control: painting it would cover
  // what is underneath, which is the opposite of helping the person see where they are.
  const absolute = entries.some(entry => entry.position === 'absolute');
  const finalStyle = absolute
    ? resolved
    : [
        resolved,
        { backgroundColor: fill },
        ...(focused && focusIndicator && hasBorder ? [{ borderColor: ring }] : []),
      ];

  return <AnimatedPressable
    {...rest}
    onHoverIn={(event) => { setHovered(true); rest.onHoverIn?.(event); }}
    onHoverOut={(event) => { setHovered(false); rest.onHoverOut?.(event); }}
    onPressIn={(event) => { setPressed(true); onPressIn?.(event); }}
    onPressOut={(event) => { setPressed(false); onPressOut?.(event); }}
    onFocus={(event) => { focusProps.onFocus(); onFocus?.(event); }}
    onBlur={(event) => { focusProps.onBlur(); onBlur?.(event); }}
    style={finalStyle as StyleProp<ViewStyle>}
  >{children}</AnimatedPressable>;
}