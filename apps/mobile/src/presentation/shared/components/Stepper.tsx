import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/presentation/theme/tokens';

interface StepperProps {
  /** Paso actual, empezando en 1. */
  current: number;
  total: number;
  /** Nombre accesible, p. ej. "Paso 2 de 4". */
  accessibilityLabel: string;
  testID?: string;
}

/** Barra de progreso por pasos del flujo de unión (4 segmentos en el Figma). */
export function Stepper({ current, total, accessibilityLabel, testID }: StepperProps) {
  const step = Math.min(Math.max(current, 1), total);
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 1, max: total, now: step }}
      style={styles.row}
      testID={testID}
    >
      {Array.from({ length: total }, (_, index) => (
        <View
          key={index}
          style={[styles.segment, index < step ? styles.done : styles.pending]}
          testID={testID ? `${testID}-segment-${index}` : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  segment: { flex: 1, height: 4, borderRadius: radius.full },
  done: { backgroundColor: colors.primary },
  pending: { backgroundColor: colors.secondary200 },
});
