import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import {
  type PayoutMethod,
  PayoutMethodChangeNotAllowedError,
  type PayoutMethods,
  type PayoutMethodType,
} from '@/domain/payouts/value-objects/PayoutMethod';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { usePayoutMethods, useSelectPayoutMethod } from '@/presentation/payouts/usePayoutMethods';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { Screen } from '@/presentation/shared/components/Screen';
import { Stepper } from '@/presentation/shared/components/Stepper';
import { colors, spacing } from '@/presentation/theme/tokens';

import { useJoinFlow } from '../JoinFlowProvider';
import { JOIN_FLOW_STEPS } from './PayoutAmountScreen';

interface PayoutMethodScreenProps {
  /** Vuelve al paso 1 si se entra sin los pasos anteriores. */
  onStartOver: () => void;
  /** Se llama con el método ya guardado en el backend y en el borrador; la ruta va a confirmar. */
  onNext: () => void;
}

/**
 * Paso 4 de 4 (Figma 55:9520): cómo se recibe el payout. Los métodos los define el backend; el
 * actual aparece preseleccionado. Los datos de la cuenta llegan con "Add Account" (D4).
 */
export function PayoutMethodScreen({ onStartOver, onNext }: PayoutMethodScreenProps) {
  const { t } = useTranslation();
  const { draft } = useJoinFlow();
  const methods = usePayoutMethods();

  let body: React.ReactNode;
  if (!draft.slot) {
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {t('join.payoutMethod.missingSteps')}
        </AppText>
        <Button
          label={t('join.payoutMethod.startOver')}
          variant="secondary"
          onPress={onStartOver}
        />
      </View>
    );
  } else if (methods.isPending) {
    body = <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />;
  } else if (methods.isError) {
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {errorMessage(t, methods.error)}
        </AppText>
        <Button label={t('common.retry')} variant="secondary" onPress={() => methods.refetch()} />
      </View>
    );
  } else {
    body = <MethodPicker catalog={methods.data} onNext={onNext} />;
  }

  return (
    <Screen edges={['bottom']}>
      <Stepper
        current={4}
        total={JOIN_FLOW_STEPS}
        accessibilityLabel={t('join.step', { current: 4, total: JOIN_FLOW_STEPS })}
      />
      {body}
    </Screen>
  );
}

function MethodPicker({ catalog, onNext }: { catalog: PayoutMethods; onNext: () => void }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const { draft, setPayoutMethod } = useJoinFlow();
  const select = useSelectPayoutMethod();
  // Lo elegido aquí; si no, el del borrador (al volver de confirmar) o el guardado en el backend.
  const [picked, setPicked] = useState<PayoutMethodType | null>(null);
  const isSelectable = (type: PayoutMethodType | null) =>
    catalog.methods.some((method) => method.type === type && method.available);
  const fallback = [draft.payoutMethod, catalog.selected].find(isSelectable) ?? null;
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
        label={t('join.payoutMethod.continue')}
        disabled={selected === null}
        loading={select.isPending}
        onPress={() => {
          if (!selected || select.isPending) return;
          select.mutate(
            { type: selected, catalog },
            {
              onSuccess: () => {
                setPayoutMethod(selected);
                onNext();
              },
            },
          );
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
