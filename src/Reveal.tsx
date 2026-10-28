import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, motion } from './theme';

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
const DURATION = motion.routine;
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
 * Escape, and the key events React Native Windows delivers.
 *
 * Windows keeps keyboard focus in the app, so an overlay that opens without taking focus
 * leaves the keyboard on whatever was behind it, and an overlay that cannot be dismissed
 * with Escape traps the person inside it. Both rules live here so every surface answers
 * them the same way: the key is Escape, and the event arrives in one of two shapes.
 */
export const ESCAPE_KEY = 'Escape';

/**
 * A key event, in the shapes React Native and React Native Windows deliver it.
 *
 * React Native Windows reports the modifier keys with the event, so a handler can tell
 * Enter from Shift+Enter without guessing.
 */
export type KeyEventLike = { nativeEvent?: { key?: string; shiftKey?: boolean }; key?: string; shiftKey?: boolean };

/** True when a key event is the Escape key. */
export function isEscapeEvent(event: KeyEventLike | null | undefined): boolean {
  const key = event?.nativeEvent?.key ?? event?.key;
  return key === ESCAPE_KEY || key === 'Esc';
}

/** True when a key event is the Enter key. */
export function isEnterEvent(event: KeyEventLike | null | undefined): boolean {
  const key = event?.nativeEvent?.key ?? event?.key;
  return key === 'Enter';
}

/** True when the Shift key was held down when the key event happened. */
export function hasShift(event: KeyEventLike | null | undefined): boolean {
  return !!(event?.nativeEvent?.shiftKey ?? event?.shiftKey);
}

/**
 * The props that carry a Windows key handler onto a view.
 *
 * React Native's own TypeScript definitions do not include `onKeyDown`, but React Native
 * Windows delivers it, so the one cast lives here rather than at every call site. The
 * target type is a parameter so the same helper serves a View and a TextInput.
 */
export function keyHandlerProps<T = React.ComponentProps<typeof View>>(onKeyDown: (event: KeyEventLike) => void): T {
  return { onKeyDown } as unknown as T;
}

/**
 * Moves keyboard focus to a view when an overlay opens.
 *
 * The returned callback is a ref: it focuses the node it is given, so the focus lands on
 * whatever just mounted. Where the platform exposes no focus method the call is a no-op
 * and the overlay is still reachable by tabbing.
 */
export function useInitialFocus<T>(active: boolean) {
  return useCallback((node: T | null) => {
    if (!active || !node) return;
    const target = node as unknown as { focus?: () => void };
    if (typeof target.focus === 'function') target.focus();
  }, [active]);
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
 * Existing borders recolour in place; borderless controls get an overlaid outline, so focus is
 * visible without changing the control's size or replacing its selected fill.
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
  const full = hex.length === 3 || hex.length === 4 ? hex.split('').map(part => part + part).join('') : hex;
  const red = parseInt(full.slice(0, 2), 16);
  const green = parseInt(full.slice(2, 4), 16);
  const blue = parseInt(full.slice(4, 6), 16);
  const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : full.length === 4 ? parseInt(full[3] + full[3], 16) / 255 : 1;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

export function FocusPressable({ children, style, onFocus, onBlur, onPressIn, onPressOut, focusIndicator = true, hoverColour, tooltip, ...rest }: React.ComponentProps<typeof Pressable> & { focusIndicator?: boolean; hoverColour?: string; tooltip?: string }) {
  const { focusProps, focused } = useFocusRing();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;
  const liftAnimation = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    liftAnimation.current?.stop();
    liftAnimation.current = Animated.timing(lift, {
      toValue: hovered ? 1 : 0,
      duration: motion.fast,
      easing: Easing.out(Easing.quad),
      // A background colour is not something the native driver can animate, so this one runs
      // on the JavaScript driver. It is one value on one control.
      useNativeDriver: false,
    });
    liftAnimation.current.start();
    return () => { liftAnimation.current?.stop(); };
  }, [hovered, lift]);

  // Flatten last-wins styles so selected controls keep their effective fill while focused.
  const resolved = typeof style === 'function' ? style({ pressed }) : style;
  const flat = StyleSheet.flatten(resolved) ?? {};
  const background = typeof flat.backgroundColor === 'string' ? flat.backgroundColor : undefined;
  const baseFill = toRgba(background ?? 'transparent');
  const onAccent = background?.toLowerCase() === colors.lead.toLowerCase();
  const onLight = background ? LIGHT_FILLS.includes(background.toLowerCase()) : false;
  const hasBorder = (flat.borderWidth ?? 0) > 0;
  // The ring follows the fill it sits on: the ink on the lead block, the page colour on a
  // light fill, and the lead colour on a dark surface.
  const ring = onAccent ? colors.leadInk : onLight ? colors.page : colors.lead;
  // The fill fades to the hover colour and back. It is the control's own background, so it
  // keeps the control's own radius and nothing moves.
  const fill = lift.interpolate({ inputRange: [0, 1], outputRange: [baseFill, toRgba(hoverColour ?? 'rgba(255,255,255,0.10)')] });
  // An absolutely positioned layer is a surface, not a control: painting it would cover
  // what is underneath, which is the opposite of helping the person see where they are.
  const absolute = flat.position === 'absolute';
  const finalStyle = absolute
    ? resolved
    : [
        resolved,
        { backgroundColor: fill },
        ...(focused && focusIndicator && hasBorder ? [{ borderColor: ring }] : []),
      ];
  const focusRingStyle: ViewStyle = { ...StyleSheet.absoluteFillObject, borderRadius: flat.borderRadius ?? 0, borderColor: ring, borderWidth: 2 };
  const content = typeof children === 'function' ? children({ pressed }) : children;
  // React Native Windows has a `tooltip` prop on every view
  // (`Libraries/Components/View/ViewPropTypes.windows.js`) and React Native's own
  // TypeScript definitions do not carry it, so the one cast happens here.
  const pressableProps = (tooltip ? { ...rest, tooltip } : rest) as unknown as React.ComponentProps<typeof Pressable>;

  return <AnimatedPressable
    {...pressableProps}
    onHoverIn={(event) => { setHovered(true); rest.onHoverIn?.(event); }}
    onHoverOut={(event) => { setHovered(false); setPressed(false); rest.onHoverOut?.(event); }}
    onPressIn={(event) => { setPressed(true); onPressIn?.(event); }}
    onPressOut={(event) => { setPressed(false); onPressOut?.(event); }}
    onFocus={(event) => { focusProps.onFocus(); onFocus?.(event); }}
    onBlur={(event) => { focusProps.onBlur(); onBlur?.(event); }}
    style={finalStyle as StyleProp<ViewStyle>}
  >
    {content}
    {focused && focusIndicator && !hasBorder ? <View pointerEvents="none" testID="focus-visible-ring" style={focusRingStyle} /> : null}
  </AnimatedPressable>;
}
