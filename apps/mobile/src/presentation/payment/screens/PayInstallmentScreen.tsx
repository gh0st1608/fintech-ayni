import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type { DuePayment } from '@/domain/payments/PaymentSummary';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

import { paymentErrorMessage } from '../paymentErrorMessage';
import { useCards, usePayInstallment } from '../useCards';
import { usePaymentSummary } from '../usePayments';

interface PayInstallmentScreenProps {
  installmentId: string;
  onAddCard: () => void;
  onDone: () => void;
}

type Choice = { kind: 'yape' } | { kind: 'card'; cardId: string };

/**
 * Pagar una cuota desde la app con Yape o una tarjeta guardada (COPAYNI-63, flujo D1 sin
 * diseño). Yape pide en cada pago el celular y el código de la app de Yape.
 */
export function PayInstallmentScreen({
  installmentId,
  onAddCard,
  onDone,
}: PayInstallmentScreenProps) {
  const { t } = useTranslation();
  const summary = usePaymentSummary();
  // Aquí y no en el formulario: al pagar, el resumen se refresca y la cuota deja de estar.
  const pay = usePayInstallment();
  const due = summary.data?.duePayments.find((item) => item.installmentId === installmentId);

  if (pay.data) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center} testID="payment-result">
          <AppText variant="highlight" weight="semibold" style={styles.centerText}>
            {t(pay.data.status === 'paid' ? 'payment.pay.paid' : 'payment.pay.pending')}
          </AppText>
          <Button label={t('payment.pay.done')} onPress={onDone} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      {summary.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      ) : !due ? (
        <View style={styles.center}>
          <AppText accessibilityRole="alert" style={styles.centerText}>
            {summary.isError ? errorMessage(t, summary.error) : t('payment.pay.notDue')}
          </AppText>
          <Button label={t('payment.pay.back')} variant="secondary" onPress={onDone} />
        </View>
      ) : (
        <PayForm due={due} pay={pay} onAddCard={onAddCard} />
      )}
    </Screen>
  );
}

function PayForm({
  due,
  pay,
  onAddCard,
}: {
  due: DuePayment;
  pay: ReturnType<typeof usePayInstallment>;
  onAddCard: () => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const { ids } = useContainer();
  const cards = useCards();
  const [idempotencyKey] = useState(() => ids.next());
  const [choice, setChoice] = useState<Choice>({ kind: 'yape' });
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [touched, setTouched] = useState(false);

  const phoneValid = /^9\d{8}$/.test(phoneNumber);
  const otpValid = /^\d{6}$/.test(otp);

  const submit = () => {
    setTouched(true);
    if (pay.isPending) return;
    if (choice.kind === 'yape') {
      if (!phoneValid || !otpValid) return;
      pay.mutate({
        installmentId: due.installmentId,
        payment: { method: 'yape', phoneNumber, otp },
        idempotencyKey,
      });
    } else {
      pay.mutate({
        installmentId: due.installmentId,
        payment: { method: 'card', cardId: choice.cardId },
        idempotencyKey,
      });
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AppText variant="caption" color={colors.neutral500}>
          {t('payment.pay.amount')}
        </AppText>
        <AppText variant="title" weight="semibold" testID="pay-amount">
          {formatMoney(due.amount)}
        </AppText>
        <RadioGroup label={t('payment.pay.methodLabel')}>
          <RadioCard
            title={t('payment.pay.yape')}
            description={t('payment.pay.yapeDescription')}
            selected={choice.kind === 'yape'}
            onSelect={() => setChoice({ kind: 'yape' })}
            testID="pay-yape"
          />
          {(cards.data ?? []).map((card) => (
            <RadioCard
              key={card.id}
              title={t('payment.cards.masked', {
                brand: card.brand.toUpperCase(),
                lastFour: card.lastFour,
              })}
              selected={choice.kind === 'card' && choice.cardId === card.id}
              onSelect={() => setChoice({ kind: 'card', cardId: card.id })}
              testID={`pay-card-${card.id}`}
            />
          ))}
        </RadioGroup>
        <Button label={t('payment.cards.add')} variant="secondary" onPress={onAddCard} />
        {choice.kind === 'yape' && (
          <>
            <TextField
              label={t('payment.pay.phone')}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              keyboardType="phone-pad"
              maxLength={9}
              error={touched && !phoneValid ? t('payment.pay.invalidPhone') : undefined}
              testID="yape-phone"
            />
            <TextField
              label={t('payment.pay.otp')}
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              error={touched && !otpValid ? t('payment.pay.invalidOtp') : undefined}
              testID="yape-otp"
            />
          </>
        )}
        {pay.isError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {paymentErrorMessage(t, pay.error)}
          </AppText>
        )}
      </ScrollView>
      <Button
        label={t('payment.pay.submit', { amount: formatMoney(due.amount) })}
        loading={pay.isPending}
        onPress={submit}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
