import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

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
import { colors, radius, spacing } from '@/presentation/theme/tokens';

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
      {/* Se monta en cada apertura: siempre parte de la primera duración. */}
      {plan && <DurationForm plan={plan} durations={durations} />}
    </BottomSheet>
  );
}

function DurationForm({ plan, durations }: { plan: SavingPlan; durations: number[] }) {
  const { t } = useTranslation();
  const quotes = useSavingQuotes(plan.id, durations);
  // Como el Figma 55:9220: la primera duración viene elegida y su detalle a la vista.
  const [months, setMonths] = useState<number | undefined>(durations[0]);
  const [continued, setContinued] = useState(false);
  const selected = months === undefined ? undefined : quotes[durations.indexOf(months)];

  return (
    <>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('saving.duration.title')}
        style={styles.options}
      >
        {durations.map((option, index) => (
          <DurationOption
            key={option}
            months={option}
            quote={quotes[index]!}
            selected={months === option}
            onSelect={() => {
              setMonths(option);
              setContinued(false);
            }}
          />
        ))}
      </View>
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

interface DurationOptionProps {
  months: number;
  quote: { data?: SavingQuote; isError: boolean };
  selected: boolean;
  onSelect: () => void;
}

/** Tarjeta de duración del Figma: los meses arriba y la cuota mensual debajo de una línea. */
function DurationOption({ months, quote, selected, onSelect }: DurationOptionProps) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const color = selected ? colors.primary : colors.black;
  let installment: string;
  if (quote.data) {
    installment = formatMoney(quote.data.monthlyInstallment, { trimZeroDecimals: true });
  } else {
    installment = quote.isError ? t('saving.duration.unavailable') : t('common.loading');
  }
  const monthsLabel = t('saving.duration.monthsLabel', { count: months });
  const perMonth = t('saving.duration.perMonth');

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={`${months} ${monthsLabel}. ${installment} ${perMonth}`}
      accessibilityState={{ checked: selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.pressed,
      ]}
      testID={`duration-${months}`}
    >
      <View style={styles.optionTop} importantForAccessibility="no-hide-descendants">
        <AppText variant="title" weight="semibold" color={color}>
          {months}
        </AppText>
        <AppText variant="caption" color={color}>
          {monthsLabel}
        </AppText>
      </View>
      <View style={styles.optionBottom} importantForAccessibility="no-hide-descendants">
        <AppText weight="semibold" color={color}>
          {installment}
        </AppText>
        <AppText variant="caption" color={color} style={styles.small}>
          {perMonth}
        </AppText>
      </View>
    </Pressable>
  );
}

function QuoteDetails({ quote }: { quote: SavingQuote }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  // El total ya incluye el cashback (Total Payout del Figma).
  const columns = [
    { key: 'startsOn', value: formatDate(periodDate(quote.startsOn), 'monthYear') },
    { key: 'payout', value: formatDate(periodDate(quote.payoutPeriod), 'monthYear') },
    { key: 'total', value: formatMoney(quote.total, { trimZeroDecimals: true }) },
  ] as const;
  return (
    <View style={styles.details} testID="quote-details" accessibilityLiveRegion="polite">
      {columns.map(({ key, value }, index) => (
        <View
          key={key}
          style={[styles.column, index < columns.length - 1 && styles.columnDivider]}
          testID={`quote-${key}`}
        >
          <AppText variant="caption" color={colors.neutral500} style={styles.label}>
            {t(`saving.duration.details.${key}`)}
          </AppText>
          <AppText weight="semibold">{value}</AppText>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  error: { gap: spacing.m },
  options: { flexDirection: 'row', gap: spacing.m },
  option: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.m,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary200,
    backgroundColor: colors.background,
  },
  optionSelected: { borderWidth: 2, borderColor: colors.primary },
  pressed: { opacity: 0.85 },
  optionTop: {
    alignSelf: 'stretch',
    alignItems: 'center',
    gap: spacing.xs,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.secondary100,
  },
  optionBottom: { alignItems: 'center', gap: spacing.xxs, paddingTop: spacing.sm },
  small: { fontSize: 10, lineHeight: 14 },
  details: {
    flexDirection: 'row',
    padding: spacing.lg,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.secondary200,
  },
  column: { flex: 1, gap: spacing.xxs, paddingHorizontal: spacing.sm },
  columnDivider: { borderRightWidth: 1, borderRightColor: colors.secondary300 },
  label: { fontSize: 10, textTransform: 'uppercase' },
});
