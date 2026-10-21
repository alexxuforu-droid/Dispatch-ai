// Two components in the shared set were exported but never rendered. Both are put to work
// rather than deleted: the settings form uses the shared Field, and the toast's dismiss
// uses the shared IconButton with the close icon from the one family.
import fs from 'node:fs';

const read = file => fs.readFileSync(file, 'utf8');
const write = (file, text) => fs.writeFileSync(file, text, 'utf8');
const swap = (file, from, to) => {
  const text = read(file);
  if (!text.includes(from)) { console.log('MISS', file, from.slice(0, 90)); return; }
  write(file, text.replace(from, to));
};

// ---- the shared Field takes the accessible name the form already used -------------------
swap('src/ui.tsx',
  `  secure,
  autoCapitalize = 'none',
  multiline,
  style,
  testID,
}: {`,
  `  secure,
  autoCapitalize = 'none',
  multiline,
  accessibilityLabel,
  style,
  testID,
}: {`);
swap('src/ui.tsx',
  `  multiline?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {`,
  `  multiline?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {`);
swap('src/ui.tsx',
  '        accessibilityLabel={label}\n        value={value}',
  '        accessibilityLabel={accessibilityLabel ?? label}\n        value={value}');

// ---- the toast dismiss is an icon button -------------------------------------------------
swap('src/ui.tsx',
  `        <FocusPressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} style={styles.toastDismiss}>
          <Text style={styles.toastDismissLabel}>Dismiss</Text>
        </FocusPressable>`,
  `        <IconButton icon={<DispatchIcon name="close" size={14} color={colors.textQuiet} />} accessibilityLabel="Dismiss notice" onPress={onDismiss} style={styles.toastDismiss} />`);

// The icon set has to be imported by the component set.
swap('src/ui.tsx',
  "import { FocusPressable } from './Reveal';",
  "import { FocusPressable } from './Reveal';\nimport { DispatchIcon } from './DispatchIcon';");

// ---- the settings form uses the shared Field ---------------------------------------------
swap('App.tsx',
  '<Text style={styles.fieldLabel}>API endpoint</Text><TextInput accessibilityLabel="OpenAI-compatible API endpoint" value={profile.endpoint} onChangeText={value => update(\'endpoint\', value)} autoCapitalize="none" autoCorrect={false} placeholder="https://api.openai.com/v1" placeholderTextColor={colors.textMuted} style={styles.providerInput} />',
  '<Field label="API endpoint" accessibilityLabel="OpenAI-compatible API endpoint" value={profile.endpoint} onChangeText={value => update(\'endpoint\', value)} placeholder="https://api.openai.com/v1" />');

swap('App.tsx',
  '<Text style={styles.fieldLabel}>Model ID</Text><TextInput accessibilityLabel="Provider model ID" value={profile.model} onChangeText={value => update(\'model\', value)} autoCapitalize="none" autoCorrect={false} placeholder="Enter a model supported by this endpoint" placeholderTextColor={colors.textMuted} style={styles.providerInput} />',
  '<Field label="Model ID" accessibilityLabel="Provider model ID" value={profile.model} onChangeText={value => update(\'model\', value)} placeholder="Enter a model supported by this endpoint" />');

swap('App.tsx',
  '<Text style={styles.fieldLabel}>Image-generation model (optional)</Text><TextInput accessibilityLabel="Image-generation model ID" value={profile.imageModel} onChangeText={value => update(\'imageModel\', value)} autoCapitalize="none" autoCorrect={false} placeholder="Enter a model that supports image generation" placeholderTextColor={colors.textMuted} style={styles.providerInput} />\n    <Text style={styles.providerHint}>The chat model also needs image-input support for automatic visual review. Unsupported review stays pending for you.</Text>',
  '<Field label="Image-generation model (optional)" accessibilityLabel="Image-generation model ID" value={profile.imageModel} onChangeText={value => update(\'imageModel\', value)} placeholder="Enter a model that supports image generation" hint="The chat model also needs image-input support for automatic visual review. Unsupported review stays pending for you." />');

swap('App.tsx',
  '<Text style={styles.fieldLabel}>API key {hasSavedKey ? \'· saved securely\' : \'\'}</Text><TextInput accessibilityLabel="Provider API key" value={apiKey} onChangeText={setApiKey} secureTextEntry autoCapitalize="none" autoCorrect={false} placeholder={hasSavedKey ? \'Leave blank to keep the saved key\' : \'Paste your provider API key\'} placeholderTextColor={colors.textMuted} style={styles.providerInput} />',
  '<Field label={hasSavedKey ? \'API key · saved securely\' : \'API key\'} accessibilityLabel="Provider API key" value={apiKey} onChangeText={setApiKey} secure placeholder={hasSavedKey ? \'Leave blank to keep the saved key\' : \'Paste your provider API key\'} />');

swap('App.tsx',
  "import { Button, Chip, EmptyState, Row, Section, Toggle, Toast, ToastSlot } from './src/ui';",
  "import { Button, Chip, EmptyState, Field, Row, Section, Toggle, Toast, ToastSlot } from './src/ui';");

console.log('the shared Field and IconButton are in use');
