// Hover is now something you can see, and it moves.
//
// The shared controls changed colour on hover, but they changed it instantly, and the
// hand rolled controls in the app did not change at all. Now every control lifts: the fill
// fades from the control's own colour to the hover colour over a tenth of a second, and the
// fill follows the control's own radius, so nothing grows and nothing shifts.
//
// The fade is a colour interpolation driven by the JavaScript driver, because a background
// colour is not something the native driver can animate. The focus ring and the press stay
// as they were.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 100)); return; }
  write(file, text.replace(from, to));
};

// ---- the focus ring gets a hover ------------------------------------------------------------
swap('src/Reveal.tsx',
  "import React, { useEffect, useRef, useState } from 'react';",
  "import React, { useEffect, useRef, useState } from 'react';");

swap('src/Reveal.tsx',
  "export function FocusPressable({ children, style, onFocus, onBlur, focusIndicator = true, ...rest }: React.ComponentProps<typeof Pressable> & { focusIndicator?: boolean }) {\n  const { focusProps, focused } = useFocusRing();\n  return <Pressable",
  `export function FocusPressable({ children, style, onFocus, onBlur, focusIndicator = true, hoverColour, ...rest }: React.ComponentProps<typeof Pressable> & { focusIndicator?: boolean; hoverColour?: string }) {
  const { focusProps, focused } = useFocusRing();
  const [hovered, setHovered] = useState(false);
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(lift, {
      toValue: hovered ? 1 : 0,
      duration: 120,
      easing: Easing.out(Easing.quad),
      // A background colour is not a native driver property, so this one runs on the
      // JavaScript driver. It is a single value on one control.
      useNativeDriver: false,
    }).start();
  }, [hovered, lift]);

  return <Pressable`);

swap('src/Reveal.tsx',
  "    onFocus={(event) => { focusProps.onFocus(); onFocus?.(event); }}",
  "    onHoverIn={(event) => { setHovered(true); rest.onHoverIn?.(event); }}\n    onHoverOut={(event) => { setHovered(false); rest.onHoverOut?.(event); }}\n    onFocus={(event) => { focusProps.onFocus(); onFocus?.(event); }}");

// The fill fades to the hover colour, and the control's own radius holds it.
swap('src/Reveal.tsx',
  `      const background = entries.map(entry => entry.backgroundColor).find(value => typeof value === 'string') as string | undefined;`,
  `      const background = entries.map(entry => entry.backgroundColor).find(value => typeof value === 'string') as string | undefined;
      const baseFill = background ?? 'transparent';`);

swap('src/Reveal.tsx',
  `      if (hasBorder) return [resolved, { borderColor: ring }];`,
  `      if (hasBorder) return [resolved, { borderColor: ring, backgroundColor: lift.interpolate({ inputRange: [0, 1], outputRange: [baseFill, hoverColour ?? 'rgba(255,255,255,0.07)'] }) }];`);

swap('src/Reveal.tsx',
  `      if (entries.some(entry => entry.position === 'absolute')) return resolved;
      return [resolved, { backgroundColor: onAccent ? colors.pop : colors.surfaceActive }];`,
  `      if (entries.some(entry => entry.position === 'absolute')) return resolved;
      return [resolved, { backgroundColor: lift.interpolate({ inputRange: [0, 1], outputRange: [baseFill, hoverColour ?? 'rgba(255,255,255,0.07)'] }) }];`);

// ---- the shared Button passes its own hover colour --------------------------------------------
swap('src/ui.tsx',
  "  buttonHovered_primary: { backgroundColor: colors.leadHover },\n  buttonHovered_secondary: { backgroundColor: colors.surfaceActive, borderColor: colors.textMuted },\n  buttonHovered_ghost: { backgroundColor: colors.surfaceActive },\n  buttonHovered_critical: { backgroundColor: colors.criticalSurface, borderColor: colors.critical },\n  buttonHovered_inverse: { backgroundColor: colors.surfaceActive },",
  "  // The fill each button fades to when the pointer is on it. The fade is the animation, so\n  // these are the end points rather than styles that switch.\n  buttonHovered_primary: { backgroundColor: colors.leadHover },\n  buttonHovered_secondary: { backgroundColor: colors.surfaceActive },\n  buttonHovered_ghost: { backgroundColor: colors.surfaceActive },\n  buttonHovered_critical: { backgroundColor: colors.criticalSurface },\n  buttonHovered_inverse: { backgroundColor: colors.surfaceActive },");

swap('src/ui.tsx',
  "      onHoverIn={() => setHovered(true)}\n      onHoverOut={() => setHovered(false)}",
  "      onHoverIn={() => setHovered(true)}\n      onHoverOut={() => setHovered(false)}\n      hoverColour={styles[\`buttonHovered_\${variant}\`].backgroundColor}");

console.log('the hover lifts and fades');
