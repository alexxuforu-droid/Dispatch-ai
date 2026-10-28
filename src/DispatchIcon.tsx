import React, { useMemo } from 'react';
import { Image } from 'react-native';
import type { ImageRequireSource } from 'react-native';
import { colors } from './theme';

/**
 * The icon set.
 *
 * React Native has no SVG renderer and React Native Windows does not ship one either, so the
 * icons are rasterised from their SVG source by `scripts/build-icons.mjs`. The set is one
 * monochrome alpha mask per icon, not one bitmap per tone, because React Native Windows
 * tints an Image at runtime.
 *
 * The tint is a real one, not a guess from the iOS behaviour:
 * `Libraries/Image/Image.windows.js` reads `props.tintColor` and passes it to the native
 * component, and `Fabric/Composition/ImageComponentView.cpp` composites a flood of that
 * colour over the bitmap with D2D1_COMPOSITE_MODE_SOURCE_IN. Direct2D's SOURCE_IN is
 * `O = DA * S` with the destination on input 0 and the source on input 1, so the bitmap
 * keeps its alpha and loses its colour. The colour in the file does not matter; the colour
 * in the theme does.
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

const masks: Record<IconName, ImageRequireSource> = {
  dispatch: require('../assets/icons/png/mask-robot.png'),
  team: require('../assets/icons/png/mask-users.png'),
  agent: require('../assets/icons/png/mask-user.png'),
  runs: require('../assets/icons/png/mask-player-play.png'),
  reviews: require('../assets/icons/png/mask-checklist.png'),
  files: require('../assets/icons/png/mask-file.png'),
  artifacts: require('../assets/icons/png/mask-photo.png'),
  settings: require('../assets/icons/png/mask-settings.png'),
  search: require('../assets/icons/png/mask-search.png'),
  plus: require('../assets/icons/png/mask-plus.png'),
  send: require('../assets/icons/png/mask-send.png'),
  close: require('../assets/icons/png/mask-x.png'),
  check: require('../assets/icons/png/mask-check.png'),
  spark: require('../assets/icons/png/mask-sparkles.png'),
  board: require('../assets/icons/png/mask-layout-kanban.png'),
  usage: require('../assets/icons/png/mask-chart-bar.png'),
  workflow: require('../assets/icons/png/mask-template.png'),
  plugins: require('../assets/icons/png/mask-puzzle.png'),
  world: require('../assets/icons/png/mask-world.png'),
  arrow: require('../assets/icons/png/mask-arrow-narrow-right.png'),
  studio: require('../assets/icons/png/mask-palette.png'),
  folder: require('../assets/icons/png/mask-folder.png'),
  shield: require('../assets/icons/png/mask-shield.png'),
  warning: require('../assets/icons/png/mask-alert-triangle.png'),
};

export function DispatchIcon({ name, size = 20, color = colors.textQuiet }: Props) {
  // The size follows the caller, so the style object is rebuilt only when it changes
  // instead of on every render. The colour is a prop, not a style: React Native Windows
  // tints the bitmap from it.
  const style = useMemo(() => ({ width: size, height: size }), [size]);
  return <Image source={masks[name]} resizeMode="contain" tintColor={color} style={style} />;
}
