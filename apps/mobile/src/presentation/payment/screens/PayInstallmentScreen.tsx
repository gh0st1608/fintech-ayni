import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import type { InstallmentPaymentResult } from '@/domain/payments/InstallmentPayment';
import type { DuePayment } from '@/domain/payments/PaymentSummary';
import { YAPE_LIMITS_MAJOR, yapeAvailability } from '@/domain/payments/yapeLimit';
import { isValidYapePhone } from '@/domain/payments/yapePhone';
import { Money } from '@/domain/shared/value-objects/Money';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Badge } from '@/presentation/shared/components/Badge';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

import { isPaymentRejection, paymentErrorMessage } from '../paymentErrorMessage';
import { useCards, usePayInstallment } from '../useCards';
import { usePaymentSummary } from '../usePayments';

interface PayInstallmentScreenProps {
  installmentId: string;
  onAddCard: () => void;
  onDone: () => void;
}

type Choice = { kind: 'yape' } | { kind: 'card'; cardId: string };

/** Lo que se pagó, para el recibo: el resumen se refresca al pagar y la cuota deja de estar. */
interface Receipt {
  due: DuePayment;
  methodLabel: string;
  result: InstallmentPaymentResult;
}

/**
 * Pagar una cuota desde la app con Yape o una tarjeta guardada (COPAYNI-63) con el diseño D1
 * aprobado (COPAYNI-77): resumen de la cuota, guía del código de Yape, aviso del tope de Yape,
 * recibo con el número de operación y reintento con otro método si se rechaza.
 */
export function PayInstallmentScreen({
  installmentId,
  onAddCard,
  onDone,
}: PayInstallmentScreenProps) {
  const { t } = useTranslation();
  const summary = usePaymentSummary();
  const pay = usePayInstallment();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const due = summary.data?.duePayments.find((item) => item.installmentId === installmentId);

  if (receipt) {
    return <ReceiptView receipt={receipt} onDone={onDone} />;
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
        <PayForm due={due} pay={pay} onAddCard={onAddCard} onPaid={setReceipt} />
      )}
    </Screen>
  );
}

function DueSummary({ due }: { due: DuePayment }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const month = formatDate(`${due.period}-01T12:00:00`, 'month');
  const date = formatDate(`${due.dueOn}T12:00:00`, 'date');
  return (
    <Card testID="pay-summary">
      <View style={styles.summary}>
        <AppText variant="caption" color={colors.neutral500}>
          {t('payment.pay.summary', { month, payout: formatMoney(due.payout) })}
        </AppText>
        <AppText variant="display" weight="semibold" testID="pay-amount">
          {formatMoney(due.amount)}
        </AppText>
        <View style={styles.row}>
          <Badge
            label={t(due.status === 'overdue' ? 'payment.pay.overdueOn' : 'payment.pay.dueOn', {
              date,
            })}
            tone="subtle"
          />
          <AppText variant="caption" color={colors.neutral600} testID="pay-slot">
            {t('payment.pay.slot', { position: due.position, slots: due.slots })}
          </AppText>
        </View>
      </View>
    </Card>
  );
}

function PayForm({
  due,
  pay,
  onAddCard,
  onPaid,
}: {
  due: DuePayment;
  pay: ReturnType<typeof usePayInstallment>;
  onAddCard: () => void;
  onPaid: (receipt: Receipt) => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const { ids, config } = useContainer();
  const cards = useCards();
  const [idempotencyKey, setIdempotencyKey] = useState(() => ids.next());
  const [picked, setPicked] = useState<Choice | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [touched, setTouched] = useState(false);

  const yape = yapeAvailability(due.amount, config.defaultCurrency);
  const savedCards = cards.data ?? [];
  const firstCard = savedCards[0];
  // Si Yape no alcanza o no cobra en esa moneda, se sugiere la primera tarjeta guardada.
  const suggested: Choice | null =
    (yape === 'over_max' || yape === 'unavailable') && firstCard
      ? { kind: 'card', cardId: firstCard.id }
      : yape === 'unavailable'
        ? null
        : { kind: 'yape' };
  const choice = picked ?? suggested;

  const phoneValid = isValidYapePhone(phoneNumber, {
    sandbox: config.paymentsSandbox ?? false,
  });
  const otpValid = /^\d{6}$/.test(otp);

  const methodLabel = (selected: Choice) => {
    if (selected.kind === 'yape') {
      return t('payment.pay.receipt.yape', { lastThree: phoneNumber.slice(-3) });
    }
    const card = savedCards.find(({ id }) => id === selected.cardId);
    return card
      ? t('payment.cards.masked', { brand: card.brand.toUpperCase(), lastFour: card.lastFour })
      : '';
  };

  const submit = () => {
    setTouched(true);
    if (pay.isPending || !choice) return;
    if (choice.kind === 'yape' && (!phoneValid || !otpValid)) return;
    const payment =
      choice.kind === 'yape'
        ? ({ method: 'yape', phoneNumber, otp } as const)
        : ({ method: 'card', cardId: choice.cardId } as const);
    pay.mutate(
      { installmentId: due.installmentId, payment, idempotencyKey },
      {
        onSuccess: (result) => onPaid({ due, methodLabel: methodLabel(choice), result }),
        // Un rechazo no se arregla repitiendo la misma clave: la pasarela devolvería el mismo
        // resultado. Un error de red sí se reintenta con la misma, para no cobrar dos veces.
        onError: (error) => {
          if (isPaymentRejection(error)) {
            setIdempotencyKey(ids.next());
            setOtp('');
          }
        },
      },
    );
  };

  const limits = YAPE_LIMITS_MAJOR.map((major) =>
    formatMoney(Money.fromMajor(major, config.defaultCurrency), { trimZeroDecimals: true }),
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <DueSummary due={due} />
        {yape === 'over_max' && (
          <InfoBanner
            message={t('payment.pay.yapeOverMax', { max: limits[limits.length - 1] })}
            testID="pay-yape-limit"
          />
        )}
        {yape === 'may_exceed' && (
          <InfoBanner
            message={t('payment.pay.yapeMayExceed', { limits: limits.join(', ') })}
            testID="pay-yape-limit"
          />
        )}
        {yape === 'unavailable' && (
          <InfoBanner message={t('payment.pay.yapeUnavailable')} testID="pay-yape-limit" />
        )}
        <RadioGroup label={t('payment.pay.methodLabel')}>
          {yape !== 'unavailable' && (
            <RadioCard
              title={t('payment.pay.yape')}
              description={t('payment.pay.yapeDescription')}
              selected={choice?.kind === 'yape'}
              onSelect={() => setPicked({ kind: 'yape' })}
              testID="pay-yape"
            />
          )}
          {savedCards.map((card) => (
            <RadioCard
              key={card.id}
              title={t('payment.cards.masked', {
                brand: card.brand.toUpperCase(),
                lastFour: card.lastFour,
              })}
              selected={choice?.kind === 'card' && choice.cardId === card.id}
              onSelect={() => setPicked({ kind: 'card', cardId: card.id })}
              testID={`pay-card-${card.id}`}
            />
          ))}
        </RadioGroup>
        <Button label={t('payment.cards.add')} variant="secondary" onPress={onAddCard} />
        {choice?.kind === 'yape' && (
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
            <AppText variant="caption" color={colors.neutral500}>
              {t('payment.pay.yapeHelp')}
            </AppText>
          </>
        )}
        {pay.isError && (
          <View style={styles.error} accessibilityRole="alert" testID="pay-error">
            <AppText color={colors.error}>{paymentErrorMessage(t, pay.error)}</AppText>
            {isPaymentRejection(pay.error) && (
              <AppText variant="caption" color={colors.neutral700}>
                {t('payment.pay.retryHint')}
              </AppText>
            )}
          </View>
        )}
      </ScrollView>
      <Button
        label={t('payment.pay.submit', { amount: formatMoney(due.amount) })}
        loading={pay.isPending}
        disabled={!choice}
        onPress={submit}
      />
    </>
  );
}

function ReceiptView({ receipt, onDone }: { receipt: Receipt; onDone: () => void }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const { due, methodLabel, result } = receipt;
  const paid = result.status === 'paid';
  const rows: [string, string][] = [
    [t('payment.pay.receipt.amount'), formatMoney(due.amount)],
    [t('payment.pay.receipt.installment'), formatDate(`${due.period}-01T12:00:00`, 'monthYear')],
    [
      t('payment.pay.receipt.circle'),
      t('payment.pay.receipt.circleValue', { payout: formatMoney(due.payout) }),
    ],
    [t('payment.pay.receipt.method'), methodLabel],
    paid && result.paidAt
      ? [t('payment.pay.receipt.date'), formatDate(result.paidAt, 'dateTime')]
      : [t('payment.pay.receipt.status'), t('payment.pay.receipt.statusPending')],
    [t('payment.pay.receipt.operation'), result.paymentId],
  ];
  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} testID="payment-result">
        <View style={styles.resultHeader}>
          <AppText
            variant="title"
            weight="semibold"
            style={styles.centerText}
            accessibilityRole="header"
          >
            {t(paid ? 'payment.pay.paid' : 'payment.pay.pending')}
          </AppText>
          {!paid && (
            <AppText color={colors.neutral700} style={styles.centerText}>
              {t('payment.pay.processing')}
            </AppText>
          )}
        </View>
        <Card testID="payment-receipt">
          <View style={styles.receipt}>
            {rows.map(([label, value]) => (
              <View key={label} style={styles.row}>
                <AppText color={colors.neutral600} style={styles.rowLabel}>
                  {label}
                </AppText>
                <AppText weight="semibold" selectable>
                  {value}
                </AppText>
              </View>
            ))}
          </View>
        </Card>
      </ScrollView>
      <Button label={t('payment.pay.done')} onPress={onDone} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  summary: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  rowLabel: { flex: 1 },
  receipt: { gap: spacing.sm },
  resultHeader: { gap: spacing.sm, paddingTop: spacing.l },
  error: { gap: spacing.xxs },
});
