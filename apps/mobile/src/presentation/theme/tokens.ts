/**
 * Tokens de diseño extraídos de las variables del Figma (nodo Home 55:8637).
 * Tipografía del diseño: Outfit. Se incorporará como fuente en COPAYNI-14; mientras tanto se usa la del sistema.
 */
export const colors = {
  primary: '#3051BB',
  primary100: '#E0E5F7',
  primary300: '#A1B2E7',
  secondary100: '#E7EBEF',
  secondary200: '#DAE1E7',
  neutral100: '#E3E3E3',
  neutral500: '#898384',
  textPrimary: '#0E0E0F',
  black: '#0A0A0B',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  onPrimary: '#FFFFFF',
} as const;

export const spacing = {
  xxs: 2,
  xs: 6,
  sm: 10,
  m: 14,
  l: 20,
  xl: 28,
} as const;

export const radius = {
  xxs: 2,
  sm: 6,
  md: 12,
  full: 1000,
} as const;

export const typography = {
  footnote: { fontSize: 10, lineHeight: 12 },
  caption: { fontSize: 12, lineHeight: 14.4 },
  body: { fontSize: 14, lineHeight: 16.8 },
  highlight: { fontSize: 16, lineHeight: 19.2 },
  title: { fontSize: 22, lineHeight: 26.4 },
  display: { fontSize: 28, lineHeight: 33.6 },
} as const;

export const fontWeight = {
  light: '300',
  regular: '400',
  semibold: '600',
} as const;

/** Tamaño mínimo de área táctil recomendado para accesibilidad. */
export const MIN_TOUCH_TARGET = 48;
