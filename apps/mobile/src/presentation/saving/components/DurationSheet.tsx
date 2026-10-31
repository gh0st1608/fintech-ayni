import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import {
  InvalidSavingQuoteError,
  type SavingPlan,
  type SavingQuote,
} from '@/domain/savings/SavingPlan';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { BottomSheet } from '@/presentation/shared/components/BottomSheet';
import { Button } from '@/presentation/shared/components/Button';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { RadioCard, RadioGroup } from '@/presentation/shared/components/RadioCard';
import { colors, spacing } from '@/presentation/theme/tokens';

import { savingPlanName } from '../savingPlanName';
import { useSavingQuotes } from '../useSavings';

interface DurationSheetProps {
  /** `null` mantiene la hoja cerrada. */
  plan: SavingPlan | null;
  durations: number[];
  onClose: () => void;
}

/** "2026-12" → primer día del mes en hora local, para formatearlo sin desfase de zona horaria. */
function periodDate(period: string): Date {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return new Date(year, month - 1, 1);
}

/** Choose Duration (COPAYNI-33): la cuota de cada duración y el detalle de la elegida. */
export function DurationSheet({ plan, durations, onClose }: DurationSheetProps) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      visible={plan !== null}
      title={t('saving.duration.title')}
      closeAccessibilityLabel={t('saving.duration.close')}
      onClose={onClose}
      testID="duration-sheet"
    >
      {/* Se monta en cada apertura: siempre parte sin duración elegida. */}
      {plan && <DurationForm plan={plan} durations={durations} />}
    </BottomSheet>
  );
}

function DurationForm({ plan, durations }: { plan: SavingPlan; durations: number[] }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const quotes = useSavingQuotes(plan.id, durations);
  const [months, setMonths] = useState<number | null>(null);
  const [continued, setContinued] = useState(false);
  const selected = months === null ? undefined : quotes[durations.indexOf(months)];

  const optionDescription = (index: number) => {
    const quote = quotes[index]!;
    if (quote.data) {
      return t('saving.duration.perMonth', { amount: formatMoney(quote.data.monthlyInstallment) });
    }
    return quote.isError ? t('saving.duration.unavailable') : t('common.loading');
  };

  return (
    <>
      <AppText color={colors.neutral500}>
        {t('saving.duration.subtitle', {
          plan: savingPlanName(t, plan.id),
          amount: formatMoney(plan.target, { trimZeroDecimals: true }),
        })}
      </AppText>
      <RadioGroup label={t('saving.duration.title')}>
        {durations.map((option, index) => (
          <RadioCard
            key={option}
            title={t('saving.duration.months', { count: option })}
            description={optionDescription(index)}
            selected={months === option}
            onSelect={() => {
              setMonths(option);
              setContinued(false);
            }}
            testID={`duration-${option}`}
          />
        ))}
      </RadioGroup>
      {selected?.isPending && <ActivityIndicator accessibilityLabel={t('common.loading')} />}
      {selected?.isError && (
        <View style={styles.error} testID="quote-error">
          <AppText accessibilityRole="alert">
            {selected.error instanceof InvalidSavingQuoteError
              ? t('saving.duration.invalidQuote')
              : errorMessage(t, selected.error)}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void selected.refetch()}
          />
        </View>
      )}
      {selected?.data && <QuoteDetails quote={selected.data} />}
      {continued && (
        <InfoBanner message={t('saving.duration.confirmationPending')} testID="saving-pending" />
      )}
      <Button
        label={t('saving.duration.next')}
        disabled={!selected?.data}
        onPress={() => setContinued(true)}
      />
    </>
  );
}

function QuoteDetails({ quote }: { quote: SavingQuote }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const rows = [
    { key: 'startsOn', value: formatDate(periodDate(quote.startsOn), 'monthYear') },
    { key: 'payout', value: formatDate(periodDate(quote.payoutPeriod), 'monthYear') },
    { key: 'cashback', value: formatMoney(quote.cashback) },
    { key: 'total', value: formatMoney(quote.total) },
  ] as const;
  return (
    <View style={styles.details} testID="quote-details" accessibilityLiveRegion="polite">
      {rows.map(({ key, value }) => (
        <View key={key} style={styles.row} testID={`quote-${key}`}>
          <AppText color={colors.neutral500}>{t(`saving.duration.details.${key}`)}</AppText>
          <AppText weight="semibold">{value}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  error: { gap: spacing.m },
  details: { gap: spacing.sm },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.m },
});
