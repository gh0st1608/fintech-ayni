import { StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AppText } from '@/presentation/shared/components/AppText';
import { colors, typography } from '@/presentation/theme/tokens';

/** El wordmark es la marca: se escribe igual en todos los idiomas (D15, COPAYNI-90). */
const WORDMARK = 'ayni';

interface WordmarkProps {
  size?: 'title' | 'display' | 'hero';
  color?: string;
  /**
   * Decorativo cuando la pantalla ya nombra la app en otro texto (p. ej. "Bienvenido a Ayni"):
   * así el lector de pantalla no lo repite.
   */
  decorative?: boolean;
  testID?: string;
}

/** Marca "ayni" en Outfit SemiBold (propuesta D15 aprobada); reemplaza el logo "Dart" del Figma. */
export function Wordmark({
  size = 'title',
  color = colors.primary,
  decorative = false,
  testID = 'wordmark',
}: WordmarkProps) {
  const { t } = useTranslation();
  const a11y = decorative
    ? ({ importantForAccessibility: 'no', accessibilityElementsHidden: true } as const)
    : ({
        accessible: true,
        accessibilityRole: 'image',
        accessibilityLabel: t('common.appName'),
      } as const);
  return (
    <AppText
      variant={size}
      weight="semibold"
      color={color}
      style={[styles.wordmark, { letterSpacing: -0.02 * typography[size].fontSize }]}
      testID={testID}
      {...a11y}
    >
      {WORDMARK}
    </AppText>
  );
}

const styles = StyleSheet.create({
  wordmark: { includeFontPadding: false },
});
