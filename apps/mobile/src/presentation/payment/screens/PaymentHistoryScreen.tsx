import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Trans, useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import NO_HISTORY from '@assets/images/payment/no-history.png';
import type { Transaction, TransactionType } from '@/domain/payments/Transaction';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { SegmentedTabs } from '@/presentation/shared/components/SegmentedTabs';
import { colors, spacing } from '@/presentation/theme/tokens';

import { useTransactions } from '../usePayments';

interface PaymentHistoryScreenProps {
  /** Estado vacío: "Explore Circles" abre la pestaña Circles. */
  onExploreCircles: () => void;
}

/** Primer día del mes `YYYY-MM`. */
function periodDate(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(year!, month! - 1, 1);
}

/**
 * Payment History (COPAYNI-41): pestañas Payments y Payouts paginadas, con monto, fecha y hora y
 * el mes del círculo. Sin el contexto de diseño (límite de Figma): se armó con el inventario y los
 * componentes existentes. El detalle de una transacción no tiene diseño (D8).
 */
export function PaymentHistoryScreen({ onExploreCircles }: PaymentHistoryScreenProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<TransactionType>('payment');

  return (
    <Screen>
      <SegmentedTabs
        options={[
          { key: 'payment', label: t('payment.history.payments') },
          { key: 'payout', label: t('payment.history.payouts') },
        ]}
        selectedKey={type}
        onChange={setType}
        testID="history-tabs"
      />
      <TransactionList key={type} type={type} onExploreCircles={onExploreCircles} />
    </Screen>
  );
}

function TransactionList({
  type,
  onExploreCircles,
}: { type: TransactionType } & PaymentHistoryScreenProps) {
  const { t } = useTranslation();
  const transactions = useTransactions(type);

  if (transactions.isPending) {
    return <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />;
  }
  if (transactions.isError && !transactions.data) {
    return (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {errorMessage(t, transactions.error)}
        </AppText>
        <Button
          label={t('common.retry')}
          variant="secondary"
          onPress={() => void transactions.refetch()}
        />
      </View>
    );
  }

  const items = transactions.data.pages.flatMap((page) => page.items);
  const stale = transactions.isRefetchError || transactions.isFetchNextPageError;

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => <TransactionRow transaction={item} />}
      contentContainerStyle={styles.list}
      testID="transactions-list"
      ListHeaderComponent={
        stale ? (
          <AppText accessibilityRole="alert" color={colors.error}>
            {t('payment.history.stale', { reason: errorMessage(t, transactions.error) })}
          </AppText>
        ) : undefined
      }
      ListEmptyComponent={
        <EmptyState
          title={t(
            type === 'payment' ? 'payment.history.emptyPayments' : 'payment.history.emptyPayouts',
          )}
          description={t('payment.history.emptyDescription')}
          illustration={NO_HISTORY}
          action={{
            label: t('payment.history.explore'),
            onPress: onExploreCircles,
            variant: 'link',
          }}
          testID="transactions-empty"
        />
      }
      ListFooterComponent={
        transactions.isFetchingNextPage ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        ) : undefined
      }
      onEndReached={() => {
        if (transactions.hasNextPage && !transactions.isFetchingNextPage) {
          void transactions.fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={transactions.isRefetching && !transactions.isFetchingNextPage}
          onRefresh={() => void transactions.refetch()}
        />
      }
    />
  );
}

const KIND_ICON = {
  installment: { name: 'arrow-up-circle-outline', color: colors.error },
  debtSettlement: { name: 'arrow-up-circle-outline', color: colors.error },
  payout: { name: 'arrow-down-circle-outline', color: colors.success },
  refund: { name: 'arrow-down-circle-outline', color: colors.success },
} as const satisfies Record<Transaction['kind'], { name: string; color: string }>;

/** Fila del Figma: monto y fecha arriba; debajo, qué fue con el mes del círculo resaltado. */
function TransactionRow({ transaction }: { transaction: Transaction }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const occurredAt = formatDate(transaction.occurredAt, 'dateTime');
  const icon = KIND_ICON[transaction.kind];
  return (
    <Card style={styles.row} testID={`transaction-${transaction.id}`}>
      <View style={styles.rowText}>
        <View style={styles.rowHeader}>
          <Ionicons name={icon.name} size={20} color={icon.color} />
          <AppText weight="semibold">{formatMoney(transaction.amount)}</AppText>
          <AppText variant="caption" color={colors.neutral500} style={styles.small}>
            {occurredAt}
          </AppText>
        </View>
        <AppText variant="caption" color={colors.neutral500}>
          {transaction.period ? (
            <Trans
              i18nKey={`payment.history.description.${transaction.kind}`}
              values={{ month: formatDate(periodDate(transaction.period), 'monthYear') }}
              components={{ month: <AppText variant="caption" color={colors.primary} /> }}
            />
          ) : (
            t(`payment.history.kind.${transaction.kind}`)
          )}
        </AppText>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  list: { flexGrow: 1, gap: spacing.m, paddingVertical: spacing.l },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.m },
  rowText: { flex: 1, gap: spacing.xs },
  rowHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  small: { fontSize: 10 },
});
