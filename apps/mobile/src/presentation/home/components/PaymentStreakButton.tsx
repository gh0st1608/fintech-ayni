import Ionicons from '@expo/vector-icons/Ionicons';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import type { StreakMonth } from '@/domain/payments/PaymentStreak';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { AppText } from '@/presentation/shared/components/AppText';
import { BottomSheet } from '@/presentation/shared/components/BottomSheet';
import { Button } from '@/presentation/shared/components/Button';
import { colors, MIN_TOUCH_TARGET, radius, spacing } from '@/presentation/theme/tokens';

export const paymentStreakQueryKey = ['payments', 'streak'] as const;

/** Primer día del mes `YYYY-MM`, para formatearlo con el idioma activo. */
const periodDate = (period: string) => `${period}-01T12:00:00`;

/**
 * El fuego del header de Home (diseño D11 aprobado, COPAYNI-82): la racha de cuotas pagadas a
 * tiempo. Sin cuotas no muestra número; al tocarlo abre la hoja con los últimos meses.
 */
export function PaymentStreakButton() {
  const { t } = useTranslation();
  const { payments } = useContainer();
  const [open, setOpen] = useState(false);
  const streak = useQuery({
    queryKey: paymentStreakQueryKey,
    queryFn: ({ signal }) => payments.getPaymentStreak.execute(signal),
  });
  const months = streak.data?.months ?? 0;
  const hasHistory = (streak.data?.lastMonths.length ?? 0) > 0;

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          hasHistory ? t('home.streak.buttonA11y', { count: months }) : t('home.streak.emptyA11y')
        }
        onPress={() => setOpen(true)}
        style={styles.button}
        testID="streak-button"
      >
        <Ionicons name="flame" size={22} color={colors.streak} />
        {hasHistory && (
          <AppText weight="semibold" color={colors.streak} testID="streak-count">
            {months}
          </AppText>
        )}
      </Pressable>
      <BottomSheet
        visible={open}
        title={hasHistory ? t('home.streak.title', { count: months }) : t('home.streak.emptyTitle')}
        onClose={() => setOpen(false)}
        closeAccessibilityLabel={t('home.streak.close')}
        testID="streak-sheet"
      >
        <View style={styles.sheet}>
          <AppText color={colors.neutral700}>
            {t(hasHistory ? 'home.streak.description' : 'home.streak.emptyDescription')}
          </AppText>
          {hasHistory && (
            <View style={styles.months} testID="streak-months">
              {streak.data!.lastMonths.map((month) => (
                <MonthChip key={month.period} month={month} />
              ))}
            </View>
          )}
          <Button label={t('home.streak.ok')} onPress={() => setOpen(false)} />
        </View>
      </BottomSheet>
    </>
  );
}

const MONTH_STYLE = {
  onTime: { icon: 'flame', color: colors.streak, background: colors.streak100 },
  late: { icon: 'close', color: colors.error, background: colors.background },
  pending: { icon: 'remove', color: colors.neutral500, background: colors.background },
} as const;

function MonthChip({ month }: { month: StreakMonth }) {
  const { t } = useTranslation();
  const formatDate = useFormatDate();
  const label = formatDate(periodDate(month.period), 'monthYear');
  const style = MONTH_STYLE[month.status];
  const shortMonth = formatDate(periodDate(month.period), 'month');
  return (
    <View
      style={[styles.month, { backgroundColor: style.background }]}
      accessible
      accessibilityLabel={t(`home.streak.monthA11y.${month.status}`, { month: label })}
      testID={`streak-month-${month.period}`}
    >
      <Ionicons name={style.icon} size={18} color={style.color} />
      <AppText variant="caption" weight="semibold" color={style.color}>
        {shortMonth}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    minHeight: MIN_TOUCH_TARGET,
    minWidth: MIN_TOUCH_TARGET,
    justifyContent: 'center',
  },
  sheet: { gap: spacing.lg },
  months: { flexDirection: 'row', gap: spacing.sm },
  month: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xxs,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.secondary100,
  },
});
