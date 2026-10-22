// What the interaction review found, fixed at the source.
//
// - The destructive button had no hover at all: its fill and its hover fill were the same
//   colour, so the one destructive action in the app gave no pointer feedback at all.
// - A control with no border was invisible when it had the keyboard focus, and the previous
//   revision's background fill had been dropped.
// - A press that ended outside the control left the control stuck at the pressed opacity.
// - The icon button faded to a made up colour instead of a token, and its own hover style was
//   unreachable behind the animated fill.
// - The tooltip only appeared for a pointer, never for the keyboard.
// - The four digit hex in the scrim would have produced a broken colour.
// - The hover animation was started without keeping its handle, so a control that unmounted
//   left an animation running.
// - The motion scale in the token file had no users; the durations were written out by hand.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => {
  if (text.length < 40) { console.log('REFUSING to write a tiny file:', file); process.exit(1); }
  fs.writeFileSync(file, text, 'utf8');
};
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 90)); return; }
  write(file, text.replace(from, to));
};

// ---- the destructive button has a hover ------------------------------------------------------
swap('src/theme.ts',
  "  critical: '#F49090',\n  criticalSurface: '#2A1618',",
  "  critical: '#F49090',\n  criticalSurface: '#2A1618',\n  // The destructive button lifted under the pointer: a wash of the critical colour.\n  criticalWash: 'rgba(244, 144, 144, 0.22)',");

swap('src/ui.tsx',
  "  critical: colors.criticalSurface,",
  "  critical: colors.criticalWash,");

// ---- a control with no border still shows where the keyboard is ---------------------------------
swap('src/Reveal.tsx',
  `  const finalStyle = absolute
    ? resolved
    : [
        resolved,
        { backgroundColor: fill },
        ...(focused && focusIndicator && hasBorder ? [{ borderColor: ring }] : []),
      ];`,
  `  // A control with a border shows the focus on that border. One without has no border to
  // recolour, so the focus paints a fill instead, and the hover fill steps aside for it.
  const focusFill = onAccent ? colors.pop : colors.surfaceActive;
  const finalStyle = absolute
    ? resolved
    : [
        resolved,
        { backgroundColor: focused && focusIndicator && !hasBorder ? focusFill : fill },
        ...(focused && focusIndicator && hasBorder ? [{ borderColor: ring }] : []),
      ];`);

// ---- a press that ends outside the control does not stick ----------------------------------------
swap('src/Reveal.tsx',
  "    onHoverOut={(event) => { setHovered(false); rest.onHoverOut?.(event); }}",
  "    onHoverOut={(event) => { setHovered(false); setPressed(false); rest.onHoverOut?.(event); }}");

// ---- the icon button fades to a token, and its own hover style goes --------------------------------
swap('src/ui.tsx',
  "  iconButtonHovered: { backgroundColor: colors.surfaceActive, borderColor: colors.line },",
  "");
swap('src/ui.tsx',
  "        style={({ pressed }) => [styles.iconButton, hovered && !disabled && styles.iconButtonHovered, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed, style]}",
  "        hoverColour={colors.surfaceActive}\n        style={({ pressed }) => [styles.iconButton, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed, style]}");

// ---- the tooltip answers the keyboard too ------------------------------------------------------------
swap('src/ui.tsx',
  "        onHoverIn={() => setHovered(true)}\n        onHoverOut={() => setHovered(false)}",
  "        onHoverIn={() => setHovered(true)}\n        onHoverOut={() => setHovered(false)}\n        onFocus={() => setHovered(true)}\n        onBlur={() => setHovered(false)}");

// ---- the four digit hex in the scrim -----------------------------------------------------------------
swap('src/Reveal.tsx',
  "  const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;",
  "  const alpha = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : full.length === 4 ? parseInt(full[3] + full[3], 16) / 255 : 1;");
swap('src/Reveal.tsx',
  "  const full = hex.length === 3 ? hex.split('').map(part => part + part).join('') : hex;",
  "  const full = hex.length === 3 || hex.length === 4 ? hex.split('').map(part => part + part).join('') : hex;");

// ---- the hover animation keeps its handle, and the motion scale has users ---------------------------
swap('src/Reveal.tsx',
  "  const lift = useRef(new Animated.Value(0)).current;\n\n  useEffect(() => {\n    Animated.timing(lift, {",
  "  const lift = useRef(new Animated.Value(0)).current;\n  const liftAnimation = useRef<Animated.CompositeAnimation | null>(null);\n\n  useEffect(() => {\n    liftAnimation.current?.stop();\n    liftAnimation.current = Animated.timing(lift, {");
swap('src/Reveal.tsx',
  "      useNativeDriver: false,\n    }).start();\n  }, [hovered, lift]);",
  "      useNativeDriver: false,\n    });\n    liftAnimation.current.start();\n    return () => { liftAnimation.current?.stop(); };\n  }, [hovered, lift]);");
swap('src/Reveal.tsx',
  "      duration: 120,",
  "      duration: motion.fast,");
swap('src/Reveal.tsx',
  "import { colors } from './theme';",
  "import { colors, motion } from './theme';");
swap('src/Reveal.tsx',
  "const DURATION = 190;",
  "const DURATION = motion.routine;");

console.log('the interaction review findings are fixed');
