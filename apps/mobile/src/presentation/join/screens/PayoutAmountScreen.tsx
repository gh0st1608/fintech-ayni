import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';

import ROCKET from '@assets/images/shared/rocket.png';

import { availablePayoutRange, type CurrencyOption } from '@/domain/circles/JoinConfig';
import type { PayoutRange } from '@/domain/circles/value-objects/PayoutRange';
import { Money } from '@/domain/shared/value-objects/Money';
import { currencyName, useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { Screen } from '@/presentation/shared/components/Screen';
import { SegmentedTabs } from '@/presentation/shared/components/SegmentedTabs';
import { Slider } from '@/presentation/shared/components/Slider';
import { Stepper } from '@/presentation/shared/components/Stepper';
import { colors, spacing } from '@/presentation/theme/tokens';

import { GameyaIntro } from '../components/GameyaIntro';
import { useJoinConfig } from '../hooks/useJoinConfig';
import { useJoinFlow } from '../JoinFlowProvider';

/** Pasos del flujo de unión a un Game'ya en el Figma. */
export const JOIN_FLOW_STEPS = 4;

interface PayoutAmountScreenProps {
  /** Se llama con el monto ya guardado en el borrador; la ruta navega al paso 2. */
  onNext: () => void;
}

/**
 * Paso 1 de 4 (Figma 55:9091): cuánto recibirá el usuario en su turno. Con más de una moneda
 * habilitada (pending-scope M2), primero se elige la moneda con las pestañas de "Choose turn"
 * (Figma 55:9444); el rango del slider es el de esa moneda.
 */
export function PayoutAmountScreen({ onNext }: PayoutAmountScreenProps) {
  const { t } = useTranslation();
  const { draft } = useJoinFlow();
  // La del borrador (p. ej. "Join now" de un Game'ya en dólares) o, sin ella, la oficial.
  const [currency, setCurrency] = useState<string | undefined>(draft.payoutAmount?.currency);
  const config = useJoinConfig(currency);

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
    const selector = config.data.currencies.length > 1 && (
      <CurrencySelector
        options={config.data.currencies}
        selected={config.data.payoutRange.currency}
        onChange={setCurrency}
      />
    );
    body = range ? (
      <PayoutPicker
        // Otra moneda es otro rango: el monto elegido no se arrastra.
        key={range.currency}
        range={range}
        isUserLimited={range.max.amount < config.data.payoutRange.max.amount}
        header={selector}
        onNext={onNext}
      />
    ) : (
      <View style={styles.content}>
        {selector}
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {t('join.payout.belowMinimum')}
        </AppText>
      </View>
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

/** Pestañas de moneda, con el tipo de cambio fijo de la elegida si no es la oficial. */
function CurrencySelector({
  options,
  selected,
  onChange,
}: {
  options: readonly CurrencyOption[];
  selected: string;
  onChange: (currency: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const formatMoney = useFormatMoney();
  const official = options.find((option) => option.official);
  const current = options.find((option) => option.code === selected);
  return (
    <View style={styles.currency}>
      <AppText variant="caption" color={colors.neutral500}>
        {t('join.currency.label')}
      </AppText>
      <SegmentedTabs
        options={options.map(({ code }) => ({
          key: code,
          label: currencyName(code, i18n.language),
        }))}
        selectedKey={selected}
        onChange={onChange}
        testID="payout-currency"
      />
      {official && current && !current.official && (
        <AppText variant="caption" color={colors.neutral600} testID="payout-currency-rate">
          {t('join.currency.rate', {
            from: formatMoney(Money.fromMajor(1, current.code)),
            to: formatMoney(Money.fromMajor(Number(current.rateToOfficial), official.code)),
          })}
        </AppText>
      )}
    </View>
  );
}

function PayoutPicker({
  range,
  isUserLimited,
  header,
  onNext,
}: {
  range: PayoutRange;
  isUserLimited: boolean;
  header?: React.ReactNode;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const { draft, setPayoutAmount } = useJoinFlow();
  // Lo elegido en esta pantalla; si no, el monto del borrador en esta moneda (p. ej. "Join now")
  // o el mínimo.
  const [selected, setSelected] = useState<number | null>(null);
  const previous =
    draft.payoutAmount?.currency === range.currency ? draft.payoutAmount.amount : undefined;
  const amount = range.clamp(selected ?? previous ?? range.min.amount);

  const format = useCallback(
    (minor: number) => formatMoney(Money.of(minor, range.currency), { trimZeroDecimals: true }),
    [formatMoney, range.currency],
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.content}>
        {header}
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
        {/* Diseño D16 aprobado (COPAYNI-87): qué es un Game'ya, con el monto elegido. */}
        <GameyaIntro payout={amount} />
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
  currency: { gap: spacing.sm },
});
