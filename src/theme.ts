export const colors = {
  canvas: '#14161B',
  sidebar: '#101216',
  panel: '#171A20',
  raised: '#1D2128',
  raisedHover: '#252A32',
  border: '#2C313A',
  borderStrong: '#3A414C',
  ink: '#F1F1F2',
  secondary: '#A5A9B2',
  // Lifted from #717782: that value sat at 3.59-4.02:1 on canvas/panel/raised and carried
  // body copy at 7-13px, which fails WCAG AA (4.5:1). #868C97 clears 4.78:1 worst case.
  muted: '#868C97',
  accent: '#9AE2D2',
  accentInk: '#14201D',
  // A lighter mint for focus on a filled accent button: a ring of the same mint would be
  // invisible, and a border would change the control's size while it is focused.
  accentFocus: '#B6EFE1',
  warning: '#E9BD79',
  danger: '#F18D92',
  white: '#FFFFFF',
} as const;

export const typography = {
  display: 'Segoe UI Variable Display',
  body: 'Segoe UI Variable Text',
  fallback: 'Segoe UI',
  mono: 'Cascadia Code',
} as const;

/**
 * Semantic type scale for the review surfaces. Named by role so a new screen cannot
 * invent a seventh pixel size: 30/20/15/13/12/11/10 plus the monospace pair. The floor is
 * 10px because Windows text scaling (up to 2.25) grows from the base size, and a 7-8px
 * base leaves a label that is unreadable before scaling even starts.
 *
 * `__tests__/type-floor.test.ts` holds the stylesheet to this floor, so the scale is a
 * contract rather than a suggestion.
 */
export const type = {
  display: { fontFamily: typography.display, fontSize: 30, lineHeight: 36, fontWeight: '700' },
  title: { fontFamily: typography.display, fontSize: 20, lineHeight: 26, fontWeight: '600' },
  heading: { fontFamily: typography.body, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  body: { fontFamily: typography.body, fontSize: 13, lineHeight: 19 },
  bodySmall: { fontFamily: typography.body, fontSize: 12, lineHeight: 17 },
  label: { fontFamily: typography.body, fontSize: 11, lineHeight: 15, fontWeight: '600' },
  caption: { fontFamily: typography.body, fontSize: 10, lineHeight: 14 },
  code: { fontFamily: typography.mono, fontSize: 11, lineHeight: 16 },
  codeSmall: { fontFamily: typography.mono, fontSize: 10, lineHeight: 15 },
} as const;
