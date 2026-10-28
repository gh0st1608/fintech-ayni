import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { Screen } from '@/presentation/shared/components/Screen';
import { Stepper } from '@/presentation/shared/components/Stepper';
import { colors, spacing } from '@/presentation/theme/tokens';

import { useInstallmentOptions } from '../hooks/useInstallmentOptions';
import { useJoinFlow } from '../JoinFlowProvider';
import { JOIN_FLOW_STEPS } from './PayoutAmountScreen';

interface MonthlyPayInScreenProps {
  /** Vuelve al paso 1; el borrador conserva el monto elegido. */
  onEdit: () => void;
  /** Se llama con la cuota ya guardada en el borrador; la ruta navega al paso 3. */
  onNext: () => void;
}

/** Paso 2 de 4 (Figma 55:9334): combinaciones cuota × meses calculadas por el backend. */
export function MonthlyPayInScreen({ onEdit, onNext }: MonthlyPayInScreenProps) {
  const { t } = useTranslation();
  const { draft } = useJoinFlow();
  const payout = draft.payoutAmount;
  const options = useInstallmentOptions(payout);

  let body: React.ReactNode;
  if (!payout) {
    // Solo pasa si se entra sin el paso 1 (p. ej. un deep link).
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {t('join.monthlyPayIn.missingPayout')}
        </AppText>
        <Button label={t('join.monthlyPayIn.choosePayout')} variant="secondary" onPress={onEdit} />
      </View>
    );
  } else if (options.isPending) {
    body = <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />;
  } else if (options.isError) {
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {errorMessage(t, options.error)}
        </AppText>
        <Button label={t('common.retry')} variant="secondary" onPress={() => options.refetch()} />
      </View>
    );
  } else {
    body = <InstallmentPicker payout={payout} options={options.data} onNext={onNext} />;
  }

  return (
    <Screen edges={['bottom']}>
      <Stepper
        current={2}
        total={JOIN_FLOW_STEPS}
        accessibilityLabel={t('join.step', { current: 2, total: JOIN_FLOW_STEPS })}
      />
      {payout && <PayoutSummary payout={payout} onEdit={onEdit} />}
      {body}
    </Screen>
  );
}

function PayoutSummary({ payout, onEdit }: { payout: Money; onEdit: () => void }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  return (
    <Card style={styles.summary} testID="payout-summary">
      <View style={styles.summaryText}>
        <AppText variant="caption" color={colors.neutral500}>
          {t('join.monthlyPayIn.summaryLabel')}
        </AppText>
        <AppText weight="semibold">{formatMoney(payout, { trimZeroDecimals: true })}</AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('join.monthlyPayIn.editA11y')}
        onPress={onEdit}
        hitSlop={spacing.sm}
      >
        <AppText weight="semibold" color={colors.primary}>
          {t('join.monthlyPayIn.edit')}
        </AppText>
      </Pressable>
    </Card>
  );
}

function InstallmentPicker({
  payout,
  options,
  onNext,
}: {
  payout: Money;
  options: InstallmentOption[];
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const { draft, setInstallment } = useJoinFlow();
  // Lo elegido aquí; si no, la cuota del borrador (al volver del paso 3) si sigue disponible.
  const [picked, setPicked] = useState<InstallmentOption | null>(null);
  const selectable = options.filter((option) => option.withinMonthlyLimit);
  const previous = draft.installment;
  const selected =
    picked ?? selectable.find((option) => previous !== null && option.sameAs(previous)) ?? null;

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="highlight" weight="semibold" accessibilityRole="header">
          {t('join.monthlyPayIn.question')}
        </AppText>
        {options.length === 0 ? (
          <AppText accessibilityRole="alert">{t('join.monthlyPayIn.empty')}</AppText>
        ) : (
          <RadioGroup label={t('join.monthlyPayIn.optionsLabel')}>
            {options.map((option) => (
              <RadioCard
                key={option.months}
                title={t('join.monthlyPayIn.option', {
                  amount: formatMoney(option.installment, { trimZeroDecimals: true }),
                })}
                description={t('join.monthlyPayIn.optionMonths', { months: option.months })}
                selected={selected !== null && option.sameAs(selected)}
                onSelect={() => setPicked(option)}
                disabled={!option.withinMonthlyLimit}
                disabledReason={t('join.monthlyPayIn.exceedsLimit')}
                testID={`installment-option-${option.months}`}
              />
            ))}
          </RadioGroup>
        )}
        <InfoBanner message={t('join.monthlyPayIn.info')} />
      </ScrollView>
      <Button
        label={t('join.next')}
        disabled={selected === null}
        onPress={() => {
          if (!selected) return;
          setInstallment(selected);
          onNext();
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  summary: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.l },
  summaryText: { flex: 1, gap: spacing.xxs },
});
