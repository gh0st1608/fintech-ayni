import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { type CardField, digitsOnly, invalidCardFields } from '@/domain/payments/CardDetails';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Screen } from '@/presentation/shared/components/Screen';
import { TextField } from '@/presentation/shared/components/TextField';
import { colors, spacing } from '@/presentation/theme/tokens';

import { paymentErrorMessage } from '../paymentErrorMessage';
import { useAddCard } from '../useCards';

/** "MM/AA" → mes y año completos; NaN si no se puede leer. */
function parseExpiration(value: string): { month: number; year: number } {
  const match = /^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/.exec(value.trim());
  if (!match) return { month: Number.NaN, year: Number.NaN };
  const year = Number(match[2]);
  return { month: Number(match[1]), year: year < 100 ? 2000 + year : year };
}

/**
 * Add Card (Figma 55:10158, COPAYNI-40). La tarjeta se tokeniza en la pasarela y al backend solo
 * llega el token: los datos viven en el estado de esta pantalla y se descartan al salir. Sin el
 * contexto de diseño (límite de Figma): se armó con los componentes existentes.
 */
export function AddCardScreen({ onAdded }: { onAdded: () => void }) {
  const { t } = useTranslation();
  const { ids } = useContainer();
  // Una clave por formulario: un reintento tras un corte no guarda la tarjeta dos veces.
  const [idempotencyKey] = useState(() => ids.next());
  const [number, setNumber] = useState('');
  const [holderName, setHolderName] = useState('');
  const [expiration, setExpiration] = useState('');
  const [securityCode, setSecurityCode] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [invalid, setInvalid] = useState<CardField[]>([]);
  const add = useAddCard();

  const fieldError = (field: CardField) =>
    invalid.includes(field) ? t(`payment.addCard.invalid.${field}`) : undefined;

  const submit = () => {
    const { month, year } = parseExpiration(expiration);
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
          value={holderName}
          onChangeText={setHolderName}
          autoCapitalize="characters"
          autoComplete="cc-name"
          error={fieldError('holderName')}
          testID="card-holder"
        />
        <TextField
          label={t('payment.addCard.expiration')}
          placeholder={t('payment.addCard.expirationPlaceholder')}
          value={expiration}
          onChangeText={setExpiration}
          keyboardType="numbers-and-punctuation"
          autoComplete="cc-exp"
          maxLength={7}
          error={fieldError('expiration')}
          testID="card-expiration"
        />
        <TextField
          label={t('payment.addCard.securityCode')}
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
});
