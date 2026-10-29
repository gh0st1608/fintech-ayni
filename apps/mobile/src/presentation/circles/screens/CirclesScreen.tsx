import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { installmentFor, type MyCircle, type MyCircleStatus } from '@/domain/circles/MyCircle';
import type { Money } from '@/domain/shared/value-objects/Money';
import { useFormatDate } from '@/presentation/formatters/formatDate';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { CircleCard } from '@/presentation/shared/components/CircleCard';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { Screen } from '@/presentation/shared/components/Screen';
import { SegmentedTabs } from '@/presentation/shared/components/SegmentedTabs';
import { colors, spacing } from '@/presentation/theme/tokens';

import { RecommendedCircles } from '../components/RecommendedCircles';
import { useMyCircles } from '../useMyCircles';
import type { JoinTarget } from '@/domain/circles/RecommendedCircle';

interface CirclesScreenProps {
  /** Estado vacío de Active: empieza el flujo de unión. */
  onJoin: () => void;
  /** "Únete ahora" de un recomendado: el flujo de unión con ese payout precargado. */
  onJoinCircle: (payout: Money, target?: JoinTarget) => void;
}

/** Primer día del mes `YYYY-MM`, para formatearlo con el idioma activo. */
function periodDate(period: string): Date {
  const [year, month] = period.split('-').map(Number);
  return new Date(year!, month! - 1, 1);
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Circles (Figma 55:9572 y 55:9688): pestañas Active y Finished con mis círculos. El diseño no
 * se pudo leer por el límite de Figma; se armó con el inventario y los componentes existentes.
 * El estado vacío de Active muestra los recomendados debajo (COPAYNI-25).
 */
export function CirclesScreen({ onJoin, onJoinCircle }: CirclesScreenProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<MyCircleStatus>('active');

  return (
    <Screen>
      <AppText
        variant="highlight"
        weight="semibold"
        accessibilityRole="header"
        style={styles.title}
      >
        {t('tabs.circles')}
      </AppText>
      <SegmentedTabs
        options={[
          { key: 'active', label: t('circles.tabs.active') },
          { key: 'finished', label: t('circles.tabs.finished') },
        ]}
        selectedKey={status}
        onChange={setStatus}
        testID="circles-tabs"
      />
      {/* Una lista por pestaña: cada una conserva su caché y su página. */}
      <MyCirclesList key={status} status={status} onJoin={onJoin} onJoinCircle={onJoinCircle} />
    </Screen>
  );
}

function MyCirclesList({
  status,
  onJoin,
  onJoinCircle,
}: { status: MyCircleStatus } & CirclesScreenProps) {
  const { t } = useTranslation();
  const circles = useMyCircles(status);

  if (circles.isPending) {
    return <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />;
  }
  if (circles.isError && !circles.data) {
    return (
      <View style={styles.center}>
        <AppText accessibilityRole="alert" style={styles.centerText}>
          {errorMessage(t, circles.error)}
        </AppText>
        <Button label={t('common.retry')} variant="secondary" onPress={() => circles.refetch()} />
      </View>
    );
  }

  const items = circles.data.pages.flatMap((page) => page.items);
  // Hay datos pero la última actualización falló (p. ej. sin conexión): se muestran con aviso.
  const stale = circles.isRefetchError || circles.isFetchNextPageError;

  return (
    <FlatList
      data={items}
      keyExtractor={(circle) => circle.circleId}
      renderItem={({ item }) => <JoinedCircleCard circle={item} />}
      contentContainerStyle={styles.list}
      testID="my-circles-list"
      ListHeaderComponent={
        stale ? (
          <AppText accessibilityRole="alert" color={colors.error}>
            {t('circles.stale', { reason: errorMessage(t, circles.error) })}
          </AppText>
        ) : undefined
      }
      ListEmptyComponent={
        status === 'active' ? (
          <View style={styles.empty}>
            <EmptyState
              title={t('circles.empty.active')}
              description={t('circles.empty.activeDescription')}
              action={{ label: t('circles.empty.join'), onPress: onJoin }}
              testID="circles-empty"
            />
            <RecommendedCircles onJoin={onJoinCircle} />
          </View>
        ) : (
          <EmptyState title={t('circles.empty.finished')} testID="circles-empty" />
        )
      }
      ListFooterComponent={
        circles.isFetchingNextPage ? (
          <ActivityIndicator accessibilityLabel={t('common.loading')} />
        ) : items.length > 0 && status === 'active' ? (
          <InfoBanner message={t('circles.priceInfo')} />
        ) : undefined
      }
      onEndReached={() => {
        if (circles.hasNextPage && !circles.isFetchingNextPage) void circles.fetchNextPage();
      }}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl
          refreshing={circles.isRefetching && !circles.isFetchingNextPage}
          onRefresh={() => void circles.refetch()}
        />
      }
    />
  );
}

function JoinedCircleCard({ circle }: { circle: MyCircle }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const formatDate = useFormatDate();
  const money = (amount: Money) => formatMoney(amount, { trimZeroDecimals: true });
  const monthYear = (period: string) => formatDate(periodDate(period), 'monthYear');

  return (
    <CircleCard
      totalAmount={money(circle.payout)}
      installmentAmount={money(installmentFor(circle, currentPeriod()))}
      installmentPeriod={t('circles.card.perMonth')}
      months={circle.months}
      turnIndex={circle.position - 1}
      turnLabel={t('circles.card.yourTurn', { month: monthYear(circle.payoutPeriod) })}
      startLabel={monthYear(circle.startsOn)}
      endLabel={monthYear(circle.endsOn)}
      durationLabel={t('circles.card.duration', { months: circle.months })}
      feesLabel={t('circles.card.adminFees')}
      feesAmount={money(circle.adminFee)}
      badge={t(circle.expelled ? 'circles.card.expelled' : 'circles.card.joined')}
      testID={`my-circle-${circle.circleId}`}
    />
  );
}

const styles = StyleSheet.create({
  title: { paddingVertical: spacing.m },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  centerText: { textAlign: 'center' },
  list: { flexGrow: 1, gap: spacing.l, paddingVertical: spacing.l },
  empty: { gap: spacing.xl },
});
