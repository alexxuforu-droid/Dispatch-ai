import React from 'react';
import { Image } from 'react-native';
import { colors } from './theme';

/**
 * The icon set.
 *
 * React Native has no SVG renderer and React Native Windows does not ship one either, so the
 * icons are rasterised from their SVG source by `scripts/build-icons.mjs`. The runtime cannot
 * recolour a bitmap, so each icon is rendered in the two tones the app needs: light for the
 * dark surfaces, dark for the white primary button.
 *
 * The sources are Tabler Icons, which is MIT licensed. The earlier version of this file
 * drew every glyph out of View rectangles, which is why the controls read as blobs.
 */
export type IconName =
  | 'dispatch'
  | 'team'
  | 'agent'
  | 'runs'
  | 'reviews'
  | 'files'
  | 'artifacts'
  | 'settings'
  | 'search'
  | 'plus'
  | 'send'
  | 'close'
  | 'check'
  | 'spark'
  | 'board'
  | 'usage'
  | 'workflow'
  | 'plugins'
  | 'world'
  | 'arrow'
  | 'studio'
  | 'folder'
  | 'shield'
  | 'warning';

type Props = { name: IconName; size?: number; color?: string };

const light: Record<IconName, number> = {
  dispatch: require('../assets/icons/png/light-robot.png'),
  team: require('../assets/icons/png/light-users.png'),
  agent: require('../assets/icons/png/light-user.png'),
  runs: require('../assets/icons/png/light-player-play.png'),
  reviews: require('../assets/icons/png/light-checklist.png'),
  files: require('../assets/icons/png/light-file.png'),
  artifacts: require('../assets/icons/png/light-photo.png'),
  settings: require('../assets/icons/png/light-settings.png'),
  search: require('../assets/icons/png/light-search.png'),
  plus: require('../assets/icons/png/light-plus.png'),
  send: require('../assets/icons/png/light-send.png'),
  close: require('../assets/icons/png/light-x.png'),
  check: require('../assets/icons/png/light-check.png'),
  spark: require('../assets/icons/png/light-sparkles.png'),
  board: require('../assets/icons/png/light-layout-kanban.png'),
  usage: require('../assets/icons/png/light-chart-bar.png'),
  workflow: require('../assets/icons/png/light-template.png'),
  plugins: require('../assets/icons/png/light-puzzle.png'),
  world: require('../assets/icons/png/light-world.png'),
  arrow: require('../assets/icons/png/light-arrow-narrow-right.png'),
  studio: require('../assets/icons/png/light-palette.png'),
  folder: require('../assets/icons/png/light-folder.png'),
  shield: require('../assets/icons/png/light-shield.png'),
  warning: require('../assets/icons/png/light-alert-triangle.png'),
};

const dark: Record<IconName, number> = {
  dispatch: require('../assets/icons/png/dark-robot.png'),
  team: require('../assets/icons/png/dark-users.png'),
  agent: require('../assets/icons/png/dark-user.png'),
  runs: require('../assets/icons/png/dark-player-play.png'),
  reviews: require('../assets/icons/png/dark-checklist.png'),
  files: require('../assets/icons/png/dark-file.png'),
  artifacts: require('../assets/icons/png/dark-photo.png'),
  settings: require('../assets/icons/png/dark-settings.png'),
  search: require('../assets/icons/png/dark-search.png'),
  plus: require('../assets/icons/png/dark-plus.png'),
  send: require('../assets/icons/png/dark-send.png'),
  close: require('../assets/icons/png/dark-x.png'),
  check: require('../assets/icons/png/dark-check.png'),
  spark: require('../assets/icons/png/dark-sparkles.png'),
  board: require('../assets/icons/png/dark-layout-kanban.png'),
  usage: require('../assets/icons/png/dark-chart-bar.png'),
  workflow: require('../assets/icons/png/dark-template.png'),
  plugins: require('../assets/icons/png/dark-puzzle.png'),
  world: require('../assets/icons/png/dark-world.png'),
  arrow: require('../assets/icons/png/dark-arrow-narrow-right.png'),
  studio: require('../assets/icons/png/dark-palette.png'),
  folder: require('../assets/icons/png/dark-folder.png'),
  shield: require('../assets/icons/png/dark-shield.png'),
  warning: require('../assets/icons/png/dark-alert-triangle.png'),
};

export function DispatchIcon({ name, size = 20, color = colors.textQuiet }: Props) {
  const source = color === colors.page || color === colors.leadInk ? dark : light;
  // A quiet icon is the same shape at a lower opacity, so the set stays one family.
  const quiet = color === colors.textQuiet || color === colors.textMuted;
  return <Image source={source[name]} resizeMode="contain" style={{ width: size, height: size, opacity: quiet ? 0.72 : 1 }} />;
}
