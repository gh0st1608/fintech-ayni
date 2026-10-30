import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import {
  type PayoutMethod,
  PayoutMethodChangeNotAllowedError,
  type PayoutMethods,
  type PayoutMethodType,
} from '@/domain/payouts/value-objects/PayoutMethod';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { useSelectPayoutMethod } from '@/presentation/payouts/usePayoutMethods';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { colors, spacing } from '@/presentation/theme/tokens';

interface PayoutMethodPickerProps {
  catalog: PayoutMethods;
  /** Preseleccionado antes que el guardado (p. ej. el del borrador de unión). */
  preferred?: PayoutMethodType | null;
  submitLabel: string;
  /** Se llama con el método ya guardado en el backend. */
  onSaved: (type: PayoutMethodType) => void;
}

/**
 * Selector de método de cobro (COPAYNI-37): lo usan el paso 4 de la unión y Payment Settings.
 * Los métodos los define el backend; el actual aparece preseleccionado.
 */
export function PayoutMethodPicker({
  catalog,
  preferred = null,
  submitLabel,
  onSaved,
}: PayoutMethodPickerProps) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const select = useSelectPayoutMethod();
  // Lo elegido aquí; si no, el preferido o el guardado en el backend.
  const [picked, setPicked] = useState<PayoutMethodType | null>(null);
  const isSelectable = (type: PayoutMethodType | null) =>
    catalog.methods.some((method) => method.type === type && method.available);
  const fallback = [preferred, catalog.selected].find(isSelectable) ?? null;
  const selected = picked ?? fallback;

  const description = (method: PayoutMethod): string | undefined =>
    method.limit
      ? t('join.payoutMethod.limit', {
          amount: formatMoney(method.limit, { trimZeroDecimals: true }),
        })
      : undefined;

  const locked = select.error instanceof PayoutMethodChangeNotAllowedError;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="highlight" weight="semibold" accessibilityRole="header">
          {t('join.payoutMethod.question')}
        </AppText>
        <RadioGroup label={t('join.payoutMethod.optionsLabel')}>
          {catalog.methods.map((method) => (
            <RadioCard
              key={method.type}
              title={t(`join.payoutMethod.types.${method.type}`)}
              description={description(method)}
              badge={method.isFree ? t('join.payoutMethod.noCharge') : undefined}
              selected={selected === method.type}
              onSelect={() => {
                setPicked(method.type);
                select.reset();
              }}
              disabled={!method.available}
              disabledReason={t('join.payoutMethod.notAvailable')}
              testID={`payout-method-${method.type}`}
            />
          ))}
        </RadioGroup>
        <AppText color={colors.textSecondary}>{t('join.payoutMethod.changeRule')}</AppText>
        {select.isError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {locked ? t('join.payoutMethod.changeNotAllowed') : errorMessage(t, select.error)}
          </AppText>
        )}
      </ScrollView>
      <Button
        label={submitLabel}
        disabled={selected === null}
        loading={select.isPending}
        onPress={() => {
          if (!selected || select.isPending) return;
          select.mutate({ type: selected, catalog }, { onSuccess: () => onSaved(selected) });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
