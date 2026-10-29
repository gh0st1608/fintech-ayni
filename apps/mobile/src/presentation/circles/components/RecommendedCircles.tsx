import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, useWindowDimensions, View } from 'react-native';

import type { JoinTarget, RecommendedCircle } from '@/domain/circles/RecommendedCircle';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { CircleCard } from '@/presentation/shared/components/CircleCard';
import { colors, radius, spacing } from '@/presentation/theme/tokens';

import { useRecommendedCircles } from '../useRecommendedCircles';

interface RecommendedCirclesProps {
  /** "Únete ahora": entra al flujo de unión con el payout del círculo. */
  onJoin: (payout: Money, target?: JoinTarget) => void;
  /** Qué mostrar si no hay recomendados; por defecto la sección se oculta. */
  emptyFallback?: React.ReactNode;
}

/** Primer día del mes `YYYY-MM`, para formatearlo con el idioma activo. */
function periodDate(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(year!, month! - 1, 1);
}

/**
 * "Recomendados para ti" (Figma 55:8637): carrusel horizontal de CircleCard con "Únete ahora".
 * Tiene su propia query, así que un error aquí no bloquea el resto de la pantalla.
 */
export function RecommendedCircles({ onJoin, emptyFallback = null }: RecommendedCirclesProps) {
  const { t } = useTranslation();
  const recommended = useRecommendedCircles();
  const { width } = useWindowDimensions();
  const cardWidth = Math.round(width * 0.85);

  let body: React.ReactNode;
  if (recommended.isPending) {
    body = (
      <View
        style={[styles.skeleton, { width: cardWidth }]}
        accessibilityLabel={t('common.loading')}
        testID="recommended-skeleton"
      />
    );
  } else if (recommended.isError && !recommended.data) {
    body = (
      <View style={styles.error}>
        <AppText accessibilityRole="alert">{errorMessage(t, recommended.error)}</AppText>
        <Button
          label={t('common.retry')}
          variant="secondary"
          onPress={() => recommended.refetch()}
        />
      </View>
    );
  } else if (recommended.data.length === 0) {
    return emptyFallback;
  } else {
    body = (
      <>
        {recommended.isRefetchError && (
          <AppText accessibilityRole="alert" color={colors.error}>
            {t('circles.recommended.stale', { reason: errorMessage(t, recommended.error) })}
          </AppText>
        )}
        <FlatList
          horizontal
          data={recommended.data}
          keyExtractor={(circle) => circle.circleId}
          renderItem={({ item }) => (
            <View style={{ width: cardWidth }}>
              <RecommendedCard circle={item} onJoin={onJoin} />
            </View>
          )}
          contentContainerStyle={styles.carousel}
          showsHorizontalScrollIndicator={false}
          snapToInterval={cardWidth + spacing.m}
          decelerationRate="fast"
          testID="recommended-circles"
        />
      </>
    );
  }

  return (
    <View style={styles.section}>
      <AppText variant="highlight" weight="semibold" accessibilityRole="header">
        {t('circles.recommended.title')}
      </AppText>
      {body}
    </View>
  );
}

function RecommendedCard({
  circle,
  onJoin,
}: {
  circle: RecommendedCircle;
  onJoin: (payout: Money, target?: JoinTarget) => void;
}) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const money = (amount: Money) => formatMoney(amount, { trimZeroDecimals: true });
  const monthYear = (period: string) => formatDate(periodDate(period), 'monthYear');
  // Una vacante de un círculo en curso (COPAYNI-59): se muestra su turno y se piden sus slots.
  const [vacancy] = circle.vacancies;

  return (
    <CircleCard
      totalAmount={money(circle.payout)}
      installmentAmount={money(circle.baseInstallment)}
      installmentPeriod={t('circles.card.perMonth')}
      months={circle.months}
      startLabel={monthYear(circle.startsOn)}
      endLabel={monthYear(circle.endsOn)}
      durationLabel={t('circles.card.duration', { months: circle.months })}
      feesLabel={t('circles.card.adminFees')}
      feesAmount={money(circle.adminFee)}
      {...(vacancy && {
        turnIndex: vacancy.position - 1,
        turnLabel: t('circles.recommended.vacancyTurn', { month: monthYear(vacancy.payoutPeriod) }),
      })}
      action={{
        label: t('circles.recommended.joinNow'),
        onPress: () =>
          vacancy
            ? onJoin(circle.payout, { circleId: circle.circleId, months: circle.months })
            : onJoin(circle.payout),
      }}
      testID={`recommended-${circle.circleId}`}
    />
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.m },
  carousel: { gap: spacing.m },
  skeleton: { height: 180, borderRadius: radius.md, backgroundColor: colors.neutral100 },
  error: { gap: spacing.m, alignItems: 'flex-start' },
});
