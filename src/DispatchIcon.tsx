import React from 'react';
import { Image } from 'react-native';
import { colors } from './theme';

/**
 * The icon set.
 *
 * React Native has no SVG renderer and React Native Windows does not ship one, so the
 * icons are rasterised from their SVG source by `scripts/build-icons.mjs` and tinted at
 * runtime. The bitmaps are white with an alpha channel, so one file per icon covers every
 * state and the app can change an icon's colour without a second asset.
 *
 * The sources are Tabler Icons, which is MIT licensed. The earlier version of this file
 * drew every glyph out of View rectangles, which is why the controls read as blobs.
 */
type Name =
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
  | 'arrow';

type Props = { name: Name; size?: number; color?: string };

const icons: Record<Name, number> = {
  dispatch: require('../assets/icons/png/robot.png'),
  team: require('../assets/icons/png/users.png'),
  agent: require('../assets/icons/png/user.png'),
  runs: require('../assets/icons/png/player-play.png'),
  reviews: require('../assets/icons/png/checklist.png'),
  files: require('../assets/icons/png/file.png'),
  artifacts: require('../assets/icons/png/photo.png'),
  settings: require('../assets/icons/png/settings.png'),
  search: require('../assets/icons/png/search.png'),
  plus: require('../assets/icons/png/plus.png'),
  send: require('../assets/icons/png/send.png'),
  close: require('../assets/icons/png/x.png'),
  check: require('../assets/icons/png/check.png'),
  spark: require('../assets/icons/png/sparkles.png'),
  board: require('../assets/icons/png/layout-kanban.png'),
  usage: require('../assets/icons/png/chart-bar.png'),
  workflow: require('../assets/icons/png/template.png'),
  plugins: require('../assets/icons/png/puzzle.png'),
  world: require('../assets/icons/png/world.png'),
  arrow: require('../assets/icons/png/arrow-narrow-right.png'),
};

export function DispatchIcon({ name, size = 20, color = colors.textQuiet }: Props) {
  return <Image source={icons[name]} resizeMode="contain" tintColor={color} style={{ width: size, height: size }} />;
}
