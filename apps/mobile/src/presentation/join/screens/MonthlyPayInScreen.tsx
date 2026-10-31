import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import ROCKET from '@assets/images/shared/rocket.png';
import type { InstallmentOption } from '@/domain/circles/value-objects/InstallmentOption';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { Chevron } from '@/presentation/shared/components/Chevron';
import { Screen } from '@/presentation/shared/components/Screen';
import { Stepper } from '@/presentation/shared/components/Stepper';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

import { JoinSummary } from '../components/JoinSummary';
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
  const formatMoney = useFormatMoney();
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
      {payout && (
        <JoinSummary
          rows={[
            {
              label: t('join.monthlyPayIn.summaryLabel'),
              value: formatMoney(payout, { trimZeroDecimals: true }),
              editLabel: t('join.monthlyPayIn.editA11y'),
              onEdit,
            },
          ]}
        />
      )}
      {body}
    </Screen>
  );
}

function InstallmentPicker({
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
  const previous = draft.installment;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <AppText variant="highlight" weight="semibold" accessibilityRole="header">
        {t('join.monthlyPayIn.question')}
      </AppText>
      {options.length === 0 ? (
        <AppText accessibilityRole="alert">{t('join.monthlyPayIn.empty')}</AppText>
      ) : (
        <View style={styles.options} accessibilityLabel={t('join.monthlyPayIn.optionsLabel')}>
          {options.map((option) => {
            const amount = formatMoney(option.installment, { trimZeroDecimals: true });
            const months = t('join.monthlyPayIn.optionMonths', { months: option.months });
            // Al volver del paso 3 se marca la cuota del borrador.
            const selected = previous !== null && option.sameAs(previous);
            return (
              <Pressable
                key={option.months}
                accessibilityRole="button"
                accessibilityLabel={[
                  `${t('join.monthlyPayIn.option', { amount })}, ${months}`,
                  option.withinMonthlyLimit ? null : t('join.monthlyPayIn.exceedsLimit'),
                ]
                  .filter(Boolean)
                  .join('. ')}
                accessibilityState={{ selected, disabled: !option.withinMonthlyLimit }}
                disabled={!option.withinMonthlyLimit}
                onPress={() => {
                  setInstallment(option);
                  onNext();
                }}
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  !option.withinMonthlyLimit && styles.optionDisabled,
                  pressed && styles.pressed,
                ]}
                testID={`installment-option-${option.months}`}
              >
                <View style={styles.optionText}>
                  <AppText color={colors.neutral500} variant="caption">
                    <AppText weight="semibold" color={colors.primary}>
                      {amount}
                    </AppText>
                    {t('join.monthlyPayIn.perMonth')}
                  </AppText>
                  {!option.withinMonthlyLimit && (
                    <AppText variant="footnote" color={colors.neutral600}>
                      {t('join.monthlyPayIn.exceedsLimit')}
                    </AppText>
                  )}
                </View>
                <AppText variant="caption" weight="semibold">
                  {months}
                </AppText>
                <Chevron />
              </Pressable>
            );
          })}
        </View>
      )}
      <InfoBanner message={t('join.monthlyPayIn.info')} illustration={ROCKET} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  content: { gap: spacing.l, paddingVertical: spacing.l },
  options: { gap: spacing.sm },
  option: {
    minHeight: MIN_TOUCH_TARGET,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.m,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary300,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.surface },
  optionDisabled: { opacity: 0.5 },
  optionText: { flex: 1, gap: spacing.xxs },
  pressed: { opacity: 0.85 },
});
