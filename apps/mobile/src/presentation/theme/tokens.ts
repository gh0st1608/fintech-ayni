import { Platform, type ViewStyle } from 'react-native';

/**
 * Tokens de diseño extraídos de las variables del Figma
 * (Home 55:8637, Payment Eligibility 55:9892, Payout Method 55:9520, Signin 55:10724,
 * Verify OTP 55:10749, Add Card 55:10158).
 */
export const colors = {
  primary: '#3051BB',
  primary100: '#E0E5F7',
  primary300: '#A1B2E7',
  secondary100: '#E7EBEF',
  secondary200: '#DAE1E7',
  secondary300: '#CED7DE',
  neutral100: '#E3E3E3',
  neutral500: '#898384',
  neutral600: '#726C6C',
  neutral700: '#5A5555',
  borderNormal: '#A1A1AA',
  textSecondary: '#3F3F46',
  success: '#15B097',
  error: '#C03744',
  textPrimary: '#0E0E0F',
  black: '#0A0A0B',
  background: '#FAFAFA',
  surface: '#FFFFFF',
  onPrimary: '#FFFFFF',
  /** Fondo detrás de hojas inferiores y diálogos (negro base al 40%). */
  overlay: 'rgba(10, 10, 11, 0.4)',
} as const;

export const spacing = {
  xxs: 2,
  xs: 6,
  sm: 10,
  m: 14,
  lg: 16,
  l: 20,
  xl: 28,
} as const;

export const radius = {
  xxs: 2,
  s: 4,
  sm: 6,
  md: 12,
  lg: 24,
  full: 1000,
} as const;

/** Familias cargadas en `fonts.ts`; en Android el peso se elige por familia, no por fontWeight. */
export const fontFamily = {
  light: 'Outfit_300Light',
  regular: 'Outfit_400Regular',
  semibold: 'Outfit_600SemiBold',
} as const;

export type FontWeight = keyof typeof fontFamily;

export const typography = {
  footnote: { fontSize: 10, lineHeight: 12 },
  caption: { fontSize: 12, lineHeight: 14.4 },
  body: { fontSize: 14, lineHeight: 16.8 },
  highlight: { fontSize: 16, lineHeight: 19.2 },
  title: { fontSize: 22, lineHeight: 26.4 },
  display: { fontSize: 28, lineHeight: 33.6 },
} as const;

/** Elevación equivalente en iOS (sombra) y Android (elevation). */
function shadow(height: number, blur: number, opacity: number, elevation: number): ViewStyle {
  return Platform.select<ViewStyle>({
    android: { elevation },
    default: {
      shadowColor: colors.black,
      shadowOffset: { width: 0, height },
      shadowRadius: blur,
      shadowOpacity: opacity,
    },
  });
}

export const elevation = {
  none: {} as ViewStyle,
  sm: shadow(1, 3, 0.08, 1),
  md: shadow(4, 12, 0.12, 4),
} as const;

/** Tamaño mínimo de área táctil recomendado para accesibilidad. */
export const MIN_TOUCH_TARGET = 48;

/** Alto de los botones de acción del Figma. */
export const BUTTON_HEIGHT = 52;
