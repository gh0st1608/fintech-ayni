import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

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
import { colors, spacing } from '@/presentation/theme/tokens';

import { savingPlanName } from '../savingPlanName';

export const mySavingsQueryKey = ['savings', 'mine'] as const;

/** `YYYY-MM-DD` de hoy en la hora del dispositivo. */
const todayOf = (date: Date): string =>
  `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Mis planes de ahorro (COPAYNI-93): lo ahorrado, el próximo aporte y, sin débito automático,
 * el botón para pagar el aporte que ya venció o vence hoy. No se muestra si no hay planes.
 */
export function MySavingPlans({ now = () => new Date() }: { now?: () => Date }) {
  const { t } = useTranslation();
  const { savings } = useContainer();
  const mine = useQuery({
    queryKey: mySavingsQueryKey,
    queryFn: ({ signal }) => savings.mine.execute(signal),
  });
  if (!mine.data || mine.data.length === 0) return null;
  return (
    <View style={styles.section} testID="my-saving-plans">
      <AppText weight="semibold">{t('saving.mine.title')}</AppText>
      {mine.data.map((subscription) => (
        <SubscriptionCard
          key={subscription.id}
          subscription={subscription}
          today={todayOf(now())}
        />
      ))}
    </View>
  );
}

function SubscriptionCard({
  subscription,
  today,
}: {
  subscription: SavingSubscription;
  today: string;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const { savings, ids } = useContainer();
  const queryClient = useQueryClient();
  const cards = useCards();
  const [attemptKey, setAttemptKey] = useState(() => ids.next());
  const next = subscription.nextContribution;
  const payable =
    subscription.status === 'active' &&
    !subscription.autoDebit &&
    next !== null &&
    next.dueOn <= today;
  const card = cards.data?.find(({ isDefault }) => isDefault) ?? cards.data?.[0];
  const pay = useMutation({
    mutationFn: (cardId: string) =>
      savings.payContribution.execute(subscription.id, cardId, attemptKey),
    onSuccess: (updated) => {
      queryClient.setQueryData<SavingSubscription[]>(mySavingsQueryKey, (current) =>
        current?.map((item) => (item.id === updated.id ? updated : item)),
      );
      setAttemptKey(ids.next());
    },
    onError: (error) => {
      if (error instanceof AppError && error.code === 'SAVING_PAYMENT_REJECTED') {
        setAttemptKey(ids.next());
      }
    },
  });
  const rejection =
    pay.error instanceof AppError && pay.error.code === 'SAVING_PAYMENT_REJECTED'
      ? rejectionReason(pay.error.fieldErrors?.detail)
      : null;

  return (
    <Card style={styles.card} testID={`saving-subscription-${subscription.id}`}>
      <AppText weight="semibold">
        {t('saving.confirm.planLabel', {
          plan: savingPlanName(t, subscription.planId),
          count: subscription.months,
        })}
      </AppText>
      <AppText color={colors.textSecondary}>
        {t('saving.mine.progress', {
          saved: formatMoney(subscription.saved),
          target: formatMoney(subscription.target),
          paid: subscription.paidContributions,
          total: subscription.months,
        })}
      </AppText>
      {next ? (
        <AppText variant="caption" color={colors.neutral600}>
          {t(subscription.autoDebit ? 'saving.confirm.nextAuto' : 'saving.confirm.nextManual', {
            amount: formatMoney(next.amount),
            date: formatDate(`${next.dueOn}T12:00:00`, 'date'),
          })}
        </AppText>
      ) : (
        <AppText variant="caption" color={colors.success}>
          {t('saving.confirm.allPaid')}
        </AppText>
      )}
      {pay.isError && (
        <AppText accessibilityRole="alert" color={colors.error}>
          {rejection
            ? t(`payment.rejectionReasons.${rejection}`)
            : pay.error instanceof AppError && pay.error.code === 'SAVING_PAYMENT_REJECTED'
              ? t('saving.confirm.rejected')
              : errorMessage(t, pay.error)}
        </AppText>
      )}
      {payable && next && card && (
        <Button
          label={t('saving.mine.pay', { amount: formatMoney(next.amount) })}
          loading={pay.isPending}
          onPress={() => pay.mutate(card.id)}
          testID={`saving-pay-${subscription.id}`}
        />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.sm },
  card: { gap: spacing.xs },
});
