import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import ROCKET from '@assets/images/shared/rocket.png';

import { availablePayoutRange } from '@/domain/circles/JoinConfig';
import type { PayoutRange } from '@/domain/circles/value-objects/PayoutRange';
import { Money } from '@/domain/shared/value-objects/Money';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { Screen } from '@/presentation/shared/components/Screen';
import { Slider } from '@/presentation/shared/components/Slider';
import { Stepper } from '@/presentation/shared/components/Stepper';
import { colors, spacing } from '@/presentation/theme/tokens';

import { useJoinConfig } from '../hooks/useJoinConfig';
import { useJoinFlow } from '../JoinFlowProvider';

/** Pasos del flujo de unión a un Game'ya en el Figma. */
export const JOIN_FLOW_STEPS = 4;

interface PayoutAmountScreenProps {
  /** Se llama con el monto ya guardado en el borrador; la ruta navega al paso 2. */
  onNext: () => void;
}

/** Paso 1 de 4 (Figma 55:9091): cuánto recibirá el usuario en su turno. */
export function PayoutAmountScreen({ onNext }: PayoutAmountScreenProps) {
  const { t } = useTranslation();
  const config = useJoinConfig();

  let body: React.ReactNode;
  if (config.isPending) {
    body = <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />;
  } else if (config.isError) {
    body = (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {errorMessage(t, config.error)}
        </AppText>
        <Button label={t('common.retry')} variant="secondary" onPress={() => config.refetch()} />
      </View>
    );
  } else {
    const range = availablePayoutRange(config.data);
    body = range ? (
      <PayoutPicker
        range={range}
        isUserLimited={range.max.amount < config.data.payoutRange.max.amount}
        onNext={onNext}
      />
    ) : (
      <AppText accessibilityRole="alert" style={styles.centerText}>
        {t('join.payout.belowMinimum')}
      </AppText>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <Stepper
        current={1}
        total={JOIN_FLOW_STEPS}
        accessibilityLabel={t('join.step', { current: 1, total: JOIN_FLOW_STEPS })}
      />
      {body}
    </Screen>
  );
}

function PayoutPicker({
  range,
  isUserLimited,
  onNext,
}: {
  range: PayoutRange;
  isUserLimited: boolean;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const { draft, setPayoutAmount } = useJoinFlow();
  // Lo elegido en esta pantalla; si no, el monto del borrador (p. ej. "Join now") o el mínimo.
  const [selected, setSelected] = useState<number | null>(null);
  const amount = range.clamp(selected ?? draft.payoutAmount?.amount ?? range.min.amount);

  const format = useCallback(
    (minor: number) => formatMoney(Money.of(minor, range.currency), { trimZeroDecimals: true }),
    [formatMoney, range.currency],
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.amount}>
          <AppText variant="caption" color={colors.neutral500} accessibilityRole="header">
            {t('join.payout.title')}
          </AppText>
          <AppText variant="display" weight="semibold" testID="payout-amount">
            {format(amount.amount)}
          </AppText>
        </View>
        <View>
          <Slider
            value={amount.amount}
            min={range.min.amount}
            max={range.max.amount}
            step={range.step.amount}
            onChange={setSelected}
            formatValue={format}
            accessibilityLabel={t('join.payout.sliderLabel')}
            testID="payout-slider"
          />
          <View style={styles.limits}>
            <AppText variant="caption" color={colors.neutral500}>
              {format(range.min.amount)}
            </AppText>
            <AppText variant="caption" color={colors.neutral500}>
              {format(range.max.amount)}
            </AppText>
          </View>
        </View>
        {isUserLimited && (
          <AppText variant="caption" color={colors.neutral600} testID="payout-user-limit">
            {t('join.payout.userLimit', { amount: format(range.max.amount) })}
          </AppText>
        )}
        <InfoBanner message={t('join.payout.info')} illustration={ROCKET} />
      </ScrollView>
      <Button
        label={t('join.next')}
        onPress={() => {
          setPayoutAmount(amount);
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
  limits: { flexDirection: 'row', justifyContent: 'space-between' },
  amount: { gap: spacing.xs },
});
