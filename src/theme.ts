/**
 * The design tokens for the native app.
 *
 * The rules these encode, in order of how much they matter:
 *
 * 1. Neutrals do the work. The surface ladder is a real ladder, so a panel, a card and a
 *    raised control separate by value instead of by border. The page is the lightest
 *    neutral and cards rise to white; the selected row is a shade, not a rise. No shadows.
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
  // The neutral ladder, light theme: the page is a soft neutral wash and cards rise to
  // white; the selected row is the one step darker.
  page: '#F2F2F5',
  surface: '#F7F7FA',
  surfaceRaised: '#FFFFFF',
  surfaceActive: '#E9EAF0',
  line: '#E4E5EA',
  // A control boundary has to be visible against its own fill, so this one is a step louder
  // than the hairline between rows.
  lineStrong: '#878C99',

  // Text. Near-black on light, never a palette colour.
  text: '#14161C',
  textQuiet: '#575D68',
  textMuted: '#5F646D',
  // The palette. One hue, three jobs: the lead is the one block of content that lands on a
  // screen, the support is the second block, and the pop is the small mark that needs attention.
  lead: '#0A5CFF',
  // One step deeper, for the hover of a control that is filled with the lead.
  leadHover: '#0949C7',
  // The ink that goes on the lead, and the ink of the inverse button that sits on it.
  leadInk: '#FFFFFF',
  support: '#DCE7FF',
  pop: '#0A5CFF',

  // State colours stay separate from the palette, and each one is always paired with a
  // word so that state is never carried by colour alone.
  attention: '#8A5A00',
  attentionSurface: '#FBF3E0',
  critical: '#C62F2F',
  criticalSurface: '#FBE9E7',
  // The destructive button lifted under the pointer: a wash of the critical colour.
  criticalWash: 'rgba(198, 47, 47, 0.12)',

  // Button-only palette, ported from the web button spec (ui/src/styles.css .btn). The fill
  // follows the lead so the web and native buttons read as one design.
  buttonPrimary: '#0A5CFF',
  buttonPrimaryHover: '#0949C7',
  buttonPrimaryInk: '#FFFFFF',
  buttonGhostHoverBorder: '#0A5CFF',
  buttonCritical: '#C62F2F',
  buttonCriticalBorder: 'rgba(198, 47, 47, 0.45)',
  buttonCriticalHover: 'rgba(198, 47, 47, 0.08)',

  // The scrim behind a modal. The page is still there, it is just not the page any more.
  scrim: '#14161C59',
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
  tag: 6,
  chip: 6,
  control: 8,
  card: 10,
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
