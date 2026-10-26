import { StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/presentation/theme/tokens';

import { AppText } from './AppText';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';

/**
 * Textos ya formateados por la pantalla (formatMoney / formatDate / i18n):
 * la tarjeta no conoce la moneda ni el idioma.
 */
export interface CircleCardProps {
  totalAmount: string;
  installmentAmount: string;
  installmentPeriod: string;
  months: number;
  /** Índice (desde 0) del mes de payout del usuario; sin él no se marca turno. */
  turnIndex?: number;
  turnLabel?: string;
  startLabel: string;
  endLabel: string;
  durationLabel: string;
  feesLabel: string;
  feesAmount: string;
  /** "Joined" en mis círculos. */
  badge?: string;
  /** "Join now" en recomendados. */
  action?: { label: string; onPress: () => void };
  testID?: string;
}

/** Tarjeta de círculo del Figma (Home y Circles): monto, cuota, timeline de turnos y fees. */
export function CircleCard({
  totalAmount,
  installmentAmount,
  installmentPeriod,
  months,
  turnIndex,
  turnLabel,
  startLabel,
  endLabel,
  durationLabel,
  feesLabel,
  feesAmount,
  badge,
  action,
  testID,
}: CircleCardProps) {
  const hasTurn = turnIndex !== undefined && turnIndex >= 0 && turnIndex < months;

  return (
    <Card style={styles.card} testID={testID}>
      <View style={styles.header}>
        <View style={styles.amounts}>
          <AppText variant="highlight" weight="semibold">
            {totalAmount}
          </AppText>
          <AppText variant="caption" color={colors.neutral500}>
            <AppText variant="caption" weight="semibold" color={colors.primary}>
              {installmentAmount}
            </AppText>
            {installmentPeriod}
          </AppText>
        </View>
        {action ? (
          <Button label={action.label} onPress={action.onPress} style={styles.action} />
        ) : (
          badge && <Badge label={badge} tone="subtle" />
        )}
      </View>

      <View style={styles.timelineBox}>
        {hasTurn && turnLabel && (
          <View style={styles.turnRow}>
            <View style={{ flex: turnIndex }} />
            <Badge label={turnLabel} />
            <View style={{ flex: months - turnIndex - 1 }} />
          </View>
        )}
        <View
          style={styles.timeline}
          importantForAccessibility="no-hide-descendants"
          testID={testID ? `${testID}-timeline` : undefined}
        >
          {Array.from({ length: months }, (_, index) => (
            <View
              key={index}
              style={[styles.month, index === turnIndex ? styles.turn : styles.idle]}
              testID={testID ? `${testID}-month-${index}` : undefined}
            />
          ))}
        </View>
        <View style={styles.labels}>
          <AppText variant="caption" color={colors.neutral500}>
            {startLabel}
          </AppText>
          <AppText variant="caption" weight="semibold">
            {durationLabel}
          </AppText>
          <AppText variant="caption" color={colors.neutral500}>
            {endLabel}
          </AppText>
        </View>
      </View>

      <AppText variant="caption" color={colors.neutral500}>
        {feesLabel}{' '}
        <AppText variant="caption" weight="semibold">
          {feesAmount}
        </AppText>
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.m },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  amounts: { flex: 1, gap: spacing.xxs },
  action: { minHeight: 36, paddingHorizontal: spacing.m },
  timelineBox: {
    gap: spacing.xs,
    padding: spacing.m,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.secondary200,
  },
  turnRow: { flexDirection: 'row', alignItems: 'center' },
  timeline: { flexDirection: 'row', gap: spacing.xxs },
  month: { flex: 1, height: 6, borderRadius: radius.full },
  idle: { backgroundColor: colors.secondary200 },
  turn: { backgroundColor: colors.primary300 },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
});
