import { StyleSheet, Text, type TextProps } from 'react-native';

import { colors, fontWeight, typography } from '@/presentation/theme/tokens';

type Variant = 'display' | 'title' | 'highlight' | 'body' | 'caption' | 'footnote';

interface AppTextProps extends TextProps {
  variant?: Variant;
  weight?: keyof typeof fontWeight;
  color?: string;
}

/** Texto base: respeta el tamaño de fuente del sistema (allowFontScaling por defecto). */
export function AppText({
  variant = 'body',
  weight = 'regular',
  color = colors.textPrimary,
  style,
  ...rest
}: AppTextProps) {
  return (
    <Text
      style={[typography[variant], { fontWeight: fontWeight[weight], color }, styles.base, style]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  base: { writingDirection: 'auto' },
});
