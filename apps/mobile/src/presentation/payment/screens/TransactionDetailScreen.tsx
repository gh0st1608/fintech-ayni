import Ionicons from '@expo/vector-icons/Ionicons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { TransactionDetail, TransactionType } from '@/domain/payments/Transaction';
import { Money } from '@/domain/shared/value-objects/Money';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, MIN_TOUCH_TARGET, spacing } from '@/presentation/theme/tokens';

export const transactionQueryKey = (type: TransactionType, id: string) =>
  ['payments', 'transaction', type, id] as const;

interface TransactionDetailScreenProps {
  /** El historial de donde viene (`payment` o `payout`), tal como llega en la ruta. */
  type: string;
  transactionId: string;
}

/** Primer día del mes `YYYY-MM`, para formatearlo con el idioma activo. */
const periodDate = (period: string) => `${period}-01T12:00:00`;

/**
 * Detalle de un movimiento del historial (diseño D8 aprobado, COPAYNI-78): el monto con su signo
 * y color, qué fue, la junta, el turno, la fecha, el desglose de un payout y el número de
 * operación, que se puede copiar.
 */
export function TransactionDetailScreen({
  type: rawType,
  transactionId,
}: TransactionDetailScreenProps) {
  const { t } = useTranslation();
  const type: TransactionType = rawType === 'payout' ? 'payout' : 'payment';
  const { payments } = useContainer();
  const detail = useQuery({
    queryKey: transactionQueryKey(type, transactionId),
    queryFn: ({ signal }) => payments.getTransaction.execute(type, transactionId, signal),
  });

  return (
    <Screen edges={['bottom']}>
      {detail.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      ) : detail.isError ? (
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {errorMessage(t, detail.error)}
          </AppText>
          <Button label={t('common.retry')} variant="secondary" onPress={() => detail.refetch()} />
        </View>
      ) : (
        <Detail transaction={detail.data} />
      )}
    </Screen>
  );
}

function Detail({ transaction }: { transaction: TransactionDetail }) {
  const { t, i18n } = useTranslation();
  const { payments } = useContainer();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const copy = useMutation({
    mutationFn: (operation: string) => payments.copyOperationNumber.execute(operation),
  });
  // Comprobante en PDF (COPAYNI-80): se descarga y se abre la hoja para guardarlo o enviarlo.
  const receipt = useMutation({
    mutationFn: () =>
      payments.shareReceipt.execute(
        { type: transaction.type, id: transaction.id },
        i18n.language,
        t('payment.transaction.receiptTitle'),
      ),
  });
  const incoming = transaction.type === 'payout';
  const tint = incoming ? colors.success : colors.textPrimary;
  const sign = incoming ? '+' : '−';
  const { deductions } = transaction;

  const rows: [string, string][] = [
    [t('payment.transaction.status'), t('payment.transaction.completed')],
    [
      t('payment.transaction.circle'),
      t('payment.transaction.circleValue', {
        payout: formatMoney(transaction.circlePayout, { trimZeroDecimals: true }),
      }),
    ],
    ...(transaction.period
      ? ([
          [t('payment.transaction.month'), formatDate(periodDate(transaction.period), 'monthYear')],
        ] as [string, string][])
      : []),
    [t('payment.transaction.turn'), String(transaction.position)],
    [t('payment.transaction.date'), formatDate(transaction.occurredAt, 'dateTime')],
  ];
  const breakdown: [string, string][] =
    deductions && deductions.amount > 0
      ? [
          [t('payment.transaction.pot'), formatMoney(transaction.circlePayout)],
          [
            t('payment.transaction.deductions'),
            `− ${formatMoney(Money.of(deductions.amount, deductions.currency))}`,
          ],
          [t('payment.transaction.received'), formatMoney(transaction.amount)],
        ]
      : [];

  return (
    <ScrollView contentContainerStyle={styles.content} testID="transaction-detail">
      <View style={styles.hero}>
        <View style={[styles.icon, { backgroundColor: incoming ? '#E3F6F2' : colors.primary100 }]}>
          <Ionicons
            name={incoming ? 'arrow-down-outline' : 'arrow-up-outline'}
            size={28}
            color={incoming ? colors.success : colors.primary}
          />
        </View>
        <AppText variant="display" weight="semibold" color={tint} testID="transaction-amount">
          {`${sign} ${formatMoney(transaction.amount)}`}
        </AppText>
        <AppText color={colors.neutral600}>{t(`payment.history.kind.${transaction.kind}`)}</AppText>
      </View>

      <Card testID="transaction-rows">
        <View style={styles.rows}>
          {rows.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
          {breakdown.length > 0 && <View style={styles.divider} />}
          {breakdown.map(([label, value]) => (
            <Row key={label} label={label} value={value} />
          ))}
        </View>
      </Card>

      <View style={styles.operation}>
        <AppText variant="caption" color={colors.neutral600} style={styles.flex} selectable>
          {t('payment.transaction.operation', { id: transaction.id })}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('payment.transaction.copy')}
          onPress={() => copy.mutate(transaction.id)}
          hitSlop={spacing.sm}
          style={styles.copy}
          testID="transaction-copy"
        >
          <Ionicons
            name={copy.isSuccess ? 'checkmark-outline' : 'copy-outline'}
            size={18}
            color={colors.primary}
          />
        </Pressable>
      </View>
      {copy.isSuccess && (
        <AppText variant="caption" color={colors.success} accessibilityLiveRegion="polite">
          {t('payment.transaction.copied')}
        </AppText>
      )}
      <Button
        label={t('payment.transaction.receipt')}
        variant="secondary"
        loading={receipt.isPending}
        onPress={() => receipt.mutate()}
        testID="transaction-receipt"
      />
      {receipt.isError && (
        <AppText accessibilityRole="alert" color={colors.error}>
          {t('payment.transaction.receiptError')}
        </AppText>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <AppText color={colors.neutral600} style={styles.flex}>
        {label}
      </AppText>
      <AppText weight="semibold">{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  hero: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.sm },
  icon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rows: { gap: spacing.m },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
  divider: { height: 1, backgroundColor: colors.secondary100 },
  operation: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  copy: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
