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
  warning: '#E9BD79',
  danger: '#F18D92',
  white: '#FFFFFF',
} as const;

export const typography = {
  display: 'Segoe UI Variable Display',
  body: 'Segoe UI Variable Text',
  fallback: 'Segoe UI',
} as const;
