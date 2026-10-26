import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fontFamily, typography, type FontWeight } from '@/presentation/theme/tokens';

type Variant = keyof typeof typography;

interface AppTextProps extends TextProps {
  variant?: Variant;
  weight?: FontWeight;
  color?: string;
}

/** Texto base: tipografía Outfit y respeto al tamaño de fuente del sistema (allowFontScaling). */
export function AppText({
  variant = 'body',
  weight = 'regular',
  color = colors.textPrimary,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      style={[typography[variant], { fontFamily: fontFamily[weight], color }, styles.base, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: { writingDirection: 'auto' },
});
