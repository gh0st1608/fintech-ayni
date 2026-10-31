import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, View } from 'react-native';

import { type CardField, digitsOnly, invalidCardFields } from '@/domain/payments/CardDetails';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { FieldError } from '@/presentation/shared/components/FieldError';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

import { paymentErrorMessage } from '../paymentErrorMessage';
import { useAddCard } from '../useCards';

/** Mes (MM) y año (AA o AAAA) del vencimiento; NaN si no se pueden leer. */
function parseExpiration(month: string, year: string): { month: number; year: number } {
  if (!/^\d{1,2}$/.test(month.trim()) || !/^(\d{2}|\d{4})$/.test(year.trim())) {
    return { month: Number.NaN, year: Number.NaN };
  }
  const fullYear = Number(year);
  return { month: Number(month), year: fullYear < 100 ? 2000 + fullYear : fullYear };
}

/**
 * Add Card (Figma 55:10158, COPAYNI-40). La tarjeta se tokeniza en la pasarela y al backend solo
 * llega el token: los datos viven en el estado de esta pantalla y se descartan al salir. El DNI
 * del titular no está en el Figma: la pasarela lo pide para tarjetas peruanas.
 */
export function AddCardScreen({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation();
  const { ids } = useContainer();
  // Una clave por formulario: un reintento tras un corte no guarda la tarjeta dos veces.
  const [idempotencyKey] = useState(() => ids.next());
  const [number, setNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expirationMonth, setExpirationMonth] = useState('');
  const [expirationYear, setExpirationYear] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [invalid, setInvalid] = useState<CardField[]>([]);
  const add = useAddCard();

  const fieldError = (field: CardField) =>
    invalid.includes(field) ? t(`payment.addCard.invalid.${field}`) : undefined;

  const submit = () => {
    const { month, year } = parseExpiration(expirationMonth, expirationYear);
    const card = {
      number,
      holderName,
      expirationMonth: month,
      expirationYear: year,
      securityCode,
      documentNumber: digitsOnly(documentNumber),
    };
    const fields = invalidCardFields(card, new Date());
    setInvalid(fields);
    if (fields.length > 0 || add.isPending) return;
    add.mutate({ card, idempotencyKey }, { onSuccess: onAdded });
  };

  return (
    <Screen edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label={t('payment.addCard.number')}
          placeholder={t('payment.addCard.numberPlaceholder')}
          value={number}
          onChangeText={setNumber}
          keyboardType="number-pad"
          autoComplete="cc-number"
          textContentType="creditCardNumber"
          maxLength={23}
          error={fieldError('number')}
          testID="card-number"
        />
        <TextField
          label={t('payment.addCard.holderName')}
          placeholder={t('payment.addCard.holderNamePlaceholder')}
          value={holderName}
          onChangeText={setHolderName}
          autoCapitalize="characters"
          autoComplete="cc-name"
          error={fieldError('holderName')}
          testID="card-holder"
        />
        <View style={styles.expiration}>
          <AppText weight="semibold">{t('payment.addCard.expiration')}</AppText>
          <View style={styles.expirationFields}>
            <View style={styles.expirationField}>
              <TextField
                label={t('payment.addCard.month')}
                hideLabel
                placeholder={t('payment.addCard.month')}
                value={expirationMonth}
                onChangeText={setExpirationMonth}
                keyboardType="number-pad"
                autoComplete="cc-exp-month"
                maxLength={2}
                testID="card-exp-month"
              />
            </View>
            <View style={styles.expirationField}>
              <TextField
                label={t('payment.addCard.year')}
                hideLabel
                placeholder={t('payment.addCard.year')}
                value={expirationYear}
                onChangeText={setExpirationYear}
                keyboardType="number-pad"
                autoComplete="cc-exp-year"
                maxLength={4}
                testID="card-exp-year"
              />
            </View>
          </View>
          <FieldError message={fieldError('expiration')} />
        </View>
        <TextField
          label={t('payment.addCard.securityCode')}
          placeholder={t('payment.addCard.securityCodePlaceholder')}
          value={securityCode}
          onChangeText={setSecurityCode}
          keyboardType="number-pad"
          autoComplete="cc-csc"
          secureTextEntry
          maxLength={4}
          error={fieldError('securityCode')}
          testID="card-cvc"
        />
        <TextField
          label={t('payment.addCard.documentNumber')}
          value={documentNumber}
          onChangeText={setDocumentNumber}
          keyboardType="number-pad"
          maxLength={12}
          error={fieldError('documentNumber')}
          testID="card-document"
        />
        <AppText variant="caption" color={colors.neutral500}>
          {t('payment.addCard.secure')}
        </AppText>
        {add.isError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {paymentErrorMessage(t, add.error)}
          </AppText>
        )}
      </ScrollView>
      <Button label={t('payment.addCard.submit')} loading={add.isPending} onPress={submit} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.l },
  expiration: { gap: spacing.sm },
  expirationFields: { flexDirection: 'row', gap: spacing.sm },
  expirationField: { flex: 1 },
});
