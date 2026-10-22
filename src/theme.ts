/**
 * The design tokens for the native app.
 *
 * The rules these encode, in order of how much they matter:
 *
 * 1. Neutrals do the work. The surface ladder is a real ladder, so a panel, a card and a
 *    raised control separate by value instead of by border. Surfaces get lighter as they
 *    rise and there are no shadows anywhere.
 * 2. Colour is content, not chrome. The sidebar, the top bar, the tabs, the inputs and the
 *    buttons are neutral. The lead colour lands on one block of content per screen, which
 *    is the thing the person came for.
 * 3. One type family for the interface, one monospace for figures, paths and identifiers.
 *    Nothing is set below 11px, because Windows text scaling grows from the base size.
 * 4. One radius per tier and one spacing scale, so nothing invents its own geometry.
 *
 * Every colour in the app comes from here. `scripts/check-rn.mjs` fails the build when a
 * hex literal appears anywhere else, which is what stops the drift that made the first
 * version of this screen hard to look at.
 */

export const colors = {
  // The neutral ladder. Page, then each surface one step lighter than the one below.
  page: '#0A0B0C',
  surface: '#141516',
  surfaceRaised: '#1C1E20',
  surfaceActive: '#26292B',
  line: '#2A2D2F',
  // A control boundary has to be visible against its own fill, so this one is a step louder
  // than the hairline between rows.
  lineStrong: '#6B7074',

  // Text. Near-white on dark, never a palette colour.
  text: '#F5F5F5',
  textQuiet: '#A3A3A3',
  textMuted: '#909599',
  // The palette. One hue, three jobs, the way the oxfords rules give a three colour
  // palette: the lead is the one block of content that lands on a screen, the support is
  // the second block, and the pop is the small mark that needs attention.
  lead: '#8E8FF0',
  // One step deeper, for the hover of a control that is filled with the lead.
  leadHover: '#7B7CD9',
  // The ink that goes on the lead, and the ink of the inverse button that sits on it.
  leadInk: '#0A0B0C',
  support: '#2A2A55',
  pop: '#C9C9FF',

  // State colours stay separate from the palette, and each one is always paired with a
  // word so that state is never carried by colour alone.
  attention: '#E9BD79',
  attentionSurface: '#241C10',
  critical: '#F49090',
  criticalSurface: '#2A1618',
  // The destructive button lifted under the pointer: a wash of the critical colour.
  criticalWash: 'rgba(244, 144, 144, 0.22)',

  // The scrim behind a modal. The page is still there, it is just not the page any more.
  scrim: '#0009',
} as const;

export const typography = {
  display: 'Segoe UI Variable Display',
  body: 'Segoe UI Variable Text',
  fallback: 'Segoe UI',
  mono: 'Cascadia Code',
} as const;

/**
 * The type scale. Seven steps and no more, so a new screen cannot invent an eighth size.
 * `hero` is the one figure outside the scale and it is used once, on Dispatch.
 *
 * The floor is 11px because Windows text scaling runs to 2.25x and grows from the base
 * size; a 10px label is unreadable before scaling even starts. `__tests__/type-floor.test.ts`
 * holds both the floor and the scale.
 */
export const type = {
  hero: { fontFamily: typography.display, fontSize: 28, lineHeight: 34, fontWeight: '600' },
  title: { fontFamily: typography.display, fontSize: 20, lineHeight: 26, fontWeight: '600' },
  section: { fontFamily: typography.body, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { fontFamily: typography.body, fontSize: 14, lineHeight: 20, fontWeight: '400' },
  bodySmall: { fontFamily: typography.body, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  label: { fontFamily: typography.body, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  meta: { fontFamily: typography.body, fontSize: 11, lineHeight: 15, fontWeight: '500' },
  code: { fontFamily: typography.mono, fontSize: 12, lineHeight: 17, fontWeight: '400' },
  codeSmall: { fontFamily: typography.mono, fontSize: 11, lineHeight: 15, fontWeight: '400' },
} as const;

/** One radius per tier. Nested inner is outer minus the gap. */
export const radius = {
  tag: 4,
  chip: 6,
  control: 8,
  card: 12,
  pill: 999,
} as const;

/** Spacing is multiples of four, and space above a heading is larger than space below it. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  section: 32,
  page: 48,
} as const;

/**
 * Motion is feedback, never decoration. Feedback lands under 250ms, a routine transition
 * under 400ms, and an exit is faster than the entrance that preceded it.
 */
export const motion = {
  fast: 120,
  routine: 200,
  overlay: 320,
  ease: 'ease-out',
} as const;
