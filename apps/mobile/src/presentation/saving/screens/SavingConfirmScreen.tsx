import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type { SavingSubscription } from '@/domain/savings/SavingSubscription';
import { AppError } from '@/domain/shared/errors/AppError';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { rejectionReason } from '@/presentation/payment/paymentErrorMessage';
import { useCards } from '@/presentation/payment/useCards';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { Checkbox } from '@/presentation/shared/components/Checkbox';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, radius, spacing } from '@/presentation/theme/tokens';

import { savingPlanName } from '../savingPlanName';
import { useSavingQuotes } from '../useSavings';

/** "2027-12" → fecha local del primer día del mes, para formatearla sin desfase de zona. */
const periodDate = (period: string): Date => {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return new Date(year, month - 1, 1);
};

/**
 * Confirmar el plan y pagar el primer aporte (COPAYNI-79, Figma D5 2052:2299). El primer aporte se
 * cobra al confirmar con la tarjeta elegida; con el débito automático, los siguientes se cobran el
 * mismo día de cada mes sin entrar a la app.
 */
export function SavingConfirmScreen({
  planId,
  months,
  onAddCard,
  onDone,
  now = () => new Date(),
}: {
  planId: string;
  months: number;
  onAddCard: () => void;
  onDone: () => void;
  now?: () => Date;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const { savings, ids } = useContainer();
  const queryClient = useQueryClient();
  const [quote] = useSavingQuotes(planId, [months]);
  const cards = useCards();
  const [autoDebit, setAutoDebit] = useState(true);
  // Una clave por intento: si la red falla, reintentar no cobra dos veces; tras un rechazo,
  // un intento nuevo usa otra clave.
  const [attemptKey, setAttemptKey] = useState(() => ids.next());
  const subscribe = useMutation({
    mutationFn: (cardId: string) =>
      savings.subscribe.execute({ planId, months, cardId, autoDebit }, attemptKey),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['savings', 'mine'] }),
    onError: (error) => {
      if (error instanceof AppError && error.code === 'SAVING_PAYMENT_REJECTED') {
        setAttemptKey(ids.next());
      }
    },
  });

  if (quote?.isPending || cards.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (!quote?.data || cards.isError) {
    const error = quote?.error ?? cards.error;
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert">{errorMessage(t, error)}</AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => {
              void quote?.refetch();
              void cards.refetch();
            }}
          />
        </View>
      </Screen>
    );
  }
  if (subscribe.data) {
    return <Subscribed subscription={subscribe.data} onDone={onDone} />;
  }

  const data = quote.data;
  const card = cards.data.find(({ isDefault }) => isDefault) ?? cards.data[0];
  const percentage = Math.round((data.cashback.amount / data.target.amount) * 100);
  const first = data.installments[0] ?? data.monthlyInstallment;
  const rejection =
    subscribe.error instanceof AppError && subscribe.error.code === 'SAVING_PAYMENT_REJECTED'
      ? rejectionReason(subscribe.error.fieldErrors?.detail)
      : null;

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero} testID="saving-confirm-plan">
          <AppText variant="caption" weight="semibold" color={colors.primary}>
            {t('saving.confirm.planLabel', { plan: savingPlanName(t, planId), count: months })}
          </AppText>
          <AppText variant="display" weight="semibold">
            {formatMoney(data.target)}
          </AppText>
          <AppText variant="caption" color={colors.neutral600}>
            {t('saving.confirm.goal')}
          </AppText>
        </View>

        <Card style={styles.rows} testID="saving-confirm-rows">
          <Row label={t('saving.confirm.monthly')} value={formatMoney(data.monthlyInstallment)} />
          <Row label={t('saving.confirm.first')} value={formatDate(now(), 'date')} />
          <Row
            label={t('saving.confirm.cashback')}
            value={`${String(percentage)} % · ${formatMoney(data.cashback)}`}
            tint={colors.success}
          />
          <Row
            label={t('saving.confirm.payout')}
            value={formatDate(periodDate(data.payoutPeriod), 'monthYear')}
          />
          <Row
            label={t('saving.confirm.method')}
            value={card ? `${card.brand.toUpperCase()} •••• ${card.lastFour}` : '—'}
          />
        </Card>

        {card ? (
          <>
            <Checkbox
              label={t('saving.confirm.autoDebit')}
              checked={autoDebit}
              onChange={setAutoDebit}
              testID="saving-auto-debit"
            />
            <AppText variant="caption" color={colors.neutral600}>
              {t('saving.confirm.disclaimer')}
            </AppText>
            {subscribe.isError && (
              <AppText accessibilityRole="alert" color={colors.error} testID="saving-confirm-error">
                {subscribe.error instanceof AppError &&
                subscribe.error.code === 'SAVING_PAYMENT_REJECTED'
                  ? rejection
                    ? t(`payment.rejectionReasons.${rejection}`)
                    : t('saving.confirm.rejected')
                  : errorMessage(t, subscribe.error)}
              </AppText>
            )}
            <Button
              label={t('saving.confirm.pay', { amount: formatMoney(first) })}
              loading={subscribe.isPending}
              onPress={() => subscribe.mutate(card.id)}
              testID="saving-confirm-pay"
            />
          </>
        ) : (
          <EmptyState
            title={t('saving.confirm.noCardTitle')}
            description={t('saving.confirm.noCardDescription')}
            action={{ label: t('saving.confirm.addCard'), onPress: onAddCard }}
            testID="saving-confirm-no-card"
          />
        )}
      </ScrollView>
    </Screen>
  );
}

function Subscribed({
  subscription,
  onDone,
}: {
  subscription: SavingSubscription;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const next = subscription.nextContribution;
  return (
    <Screen edges={['bottom']}>
      <View style={[styles.content, styles.center]} testID="saving-subscribed">
        <AppText variant="title" weight="semibold" style={styles.centerText}>
          {subscription.status === 'pending'
            ? t('saving.confirm.pendingTitle')
            : t('saving.confirm.doneTitle')}
        </AppText>
        <AppText style={styles.centerText}>
          {next
            ? t(subscription.autoDebit ? 'saving.confirm.nextAuto' : 'saving.confirm.nextManual', {
                amount: formatMoney(next.amount),
                date: formatDate(`${next.dueOn}T12:00:00`, 'date'),
              })
            : t('saving.confirm.allPaid')}
        </AppText>
        <Button label={t('saving.confirm.done')} onPress={onDone} />
      </View>
    </Screen>
  );
}

function Row({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <View style={styles.row}>
      <AppText color={colors.neutral600} style={styles.flex}>
        {label}
      </AppText>
      <AppText weight="semibold" color={tint}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, gap: spacing.m },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  hero: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.primary100,
  },
  rows: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  flex: { flex: 1 },
});
