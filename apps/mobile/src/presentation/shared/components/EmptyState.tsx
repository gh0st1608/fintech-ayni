import Ionicons from '@expo/vector-icons/Ionicons';
import { Image, Pressable, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { colors, MIN_TOUCH_TARGET, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Ilustración decorativa; se oculta a los lectores de pantalla. */
  illustration?: ImageSourcePropType;
  /** Tamaño de la ilustración en el Figma (160 por defecto). */
  illustrationSize?: number;
  /** `link`: texto con flecha, como "Explore Circles →" del Figma. */
  action?: { label: string; onPress: () => void; variant?: 'button' | 'link' };
  testID?: string;
}

/** Estado vacío de listas ("No tienes pagos pendientes", "No hay tarjetas guardadas"…). */
export function EmptyState({
  title,
  description,
  illustration,
  illustrationSize = 160,
  action,
  testID,
}: EmptyStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      {illustration && (
        <Image
          source={illustration}
          style={[styles.illustration, { width: illustrationSize, height: illustrationSize }]}
          resizeMode="contain"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />
      )}
      <AppText variant="highlight" weight="semibold" style={styles.center}>
        {title}
      </AppText>
      {description && (
        <AppText variant="caption" color={colors.neutral500} style={styles.center}>
          {description}
        </AppText>
      )}
      {action?.variant === 'link' ? (
        <Pressable accessibilityRole="button" onPress={action.onPress} style={styles.link}>
          <AppText variant="caption" weight="semibold" color={colors.primary}>
            {action.label}
          </AppText>
          <Ionicons name="arrow-forward" size={20} color={colors.primary} />
        </Pressable>
      ) : (
        action && <Button label={action.label} onPress={action.onPress} style={styles.action} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  illustration: { marginBottom: spacing.sm },
  center: { textAlign: 'center' },
  action: { marginTop: spacing.sm, alignSelf: 'stretch' },
  link: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
});
