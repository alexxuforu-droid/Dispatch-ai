// Generate src/DispatchIcon.tsx from the rendered icon set, so the file always matches the
// assets on disk.
//
// The app names icons by what they mean (a team, a run, a review); the SVG files are named
// after the shape they draw. The mapping lives here, so a new icon cannot be added to the
// assets and quietly left out of the app.
import fs from 'node:fs';

const icons = {
  dispatch: 'robot',
  team: 'users',
  agent: 'user',
  runs: 'player-play',
  reviews: 'checklist',
  files: 'file',
  artifacts: 'photo',
  settings: 'settings',
  search: 'search',
  plus: 'plus',
  send: 'send',
  close: 'x',
  check: 'check',
  spark: 'sparkles',
  board: 'layout-kanban',
  usage: 'chart-bar',
  workflow: 'template',
  plugins: 'puzzle',
  world: 'world',
  arrow: 'arrow-narrow-right',
  studio: 'palette',
  folder: 'folder',
  shield: 'shield',
  warning: 'alert-triangle',
};

const available = new Set(fs.readdirSync('assets/icons/svg').filter(name => name.endsWith('.svg')).map(name => name.replace(/\.svg$/, '')));
for (const file of Object.values(icons)) {
  if (!available.has(file)) throw new Error(`icon file missing: ${file}.svg`);
}
const unused = [...available].filter(file => !Object.values(icons).includes(file));
if (unused.length) console.log('assets with no use in the app:', unused.join(', '));

const mapFor = tone => Object.entries(icons).map(([name, file]) => `  ${name}: require('../assets/icons/png/${tone}-${file}.png'),`).join('\n');

const file = `import React from 'react';
import { Image } from 'react-native';
import { colors } from './theme';

/**
 * The icon set.
 *
 * React Native has no SVG renderer and React Native Windows does not ship one either, so the
 * icons are rasterised from their SVG source by \`scripts/build-icons.mjs\`. The runtime cannot
 * recolour a bitmap, so each icon is rendered in the two tones the app needs: light for the
 * dark surfaces, dark for the white primary button.
 *
 * The sources are Tabler Icons, which is MIT licensed. The earlier version of this file
 * drew every glyph out of View rectangles, which is why the controls read as blobs.
 */
export type IconName =
${Object.keys(icons).map(name => `  | '${name}'`).join('\n')};

type Props = { name: IconName; size?: number; color?: string };

const light: Record<IconName, number> = {
${mapFor('light')}
};

const dark: Record<IconName, number> = {
${mapFor('dark')}
};

export function DispatchIcon({ name, size = 20, color = colors.textQuiet }: Props) {
  const source = color === colors.page || color === colors.leadInk ? dark : light;
  // A quiet icon is the same shape at a lower opacity, so the set stays one family.
  const quiet = color === colors.textQuiet || color === colors.textMuted;
  return <Image source={source[name]} resizeMode="contain" style={{ width: size, height: size, opacity: quiet ? 0.72 : 1 }} />;
}
`;

fs.writeFileSync('src/DispatchIcon.tsx', file, 'utf8');
console.log(`wrote src/DispatchIcon.tsx with ${Object.keys(icons).length} icons`);
