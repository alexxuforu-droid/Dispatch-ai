// Add the hover state to the shared buttons. Hover changes a surface or a border; it never
// moves or resizes the control.
import fs from 'node:fs';

const file = 'src/ui.tsx';
let text = fs.readFileSync(file, 'utf8');

const swap = (from, to) => {
  if (!text.includes(from)) { console.log('MISS:', from.slice(0, 70)); return; }
  text = text.replace(from, to);
};

swap(
  "import React from 'react';",
  "import React, { useState } from 'react';",
);

swap(
  `  testID?: string;
}) {
  return (
    <FocusPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        styles[\`button_\${variant}\`],
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >`,
  `  testID?: string;
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
        styles[\`button_\${variant}\`],
        disabled && styles.buttonDisabled,
        hovered && !disabled && styles.buttonHovered,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >`,
);

swap(
  `  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <FocusPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, disabled && styles.buttonDisabled, pressed && !disabled && styles.pressed, style]}
    >`,
  `  disabled?: boolean;
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
    >`,
);

swap(
  "  buttonDisabled: { backgroundColor: colors.surface, borderColor: colors.line },",
  "  buttonDisabled: { backgroundColor: colors.surface, borderColor: colors.line },\n  buttonHovered: { backgroundColor: colors.surfaceActive, borderColor: colors.textMuted },",
);

swap(
  `  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'transparent',
  },`,
  `  iconButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  iconButtonHovered: { backgroundColor: colors.surfaceActive, borderColor: colors.line },`,
);

fs.writeFileSync(file, text, 'utf8');
console.log('hover states added');
