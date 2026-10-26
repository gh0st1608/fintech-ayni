import { Image, StyleSheet, View, type ImageSourcePropType } from 'react-native';

import { colors, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Ilustración decorativa; se oculta a los lectores de pantalla. */
  illustration?: ImageSourcePropType;
  action?: { label: string; onPress: () => void };
  testID?: string;
}

/** Estado vacío de listas ("No tienes pagos pendientes", "No hay tarjetas guardadas"…). */
export function EmptyState({ title, description, illustration, action, testID }: EmptyStateProps) {
  return (
    <View style={styles.container} testID={testID}>
      {illustration && (
        <Image
          source={illustration}
          style={styles.illustration}
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
      {action && <Button label={action.label} onPress={action.onPress} style={styles.action} />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  illustration: { width: 160, height: 160, marginBottom: spacing.sm },
  center: { textAlign: 'center' },
  action: { marginTop: spacing.sm, alignSelf: 'stretch' },
});
