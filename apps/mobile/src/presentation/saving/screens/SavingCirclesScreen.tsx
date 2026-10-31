import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  FlatList,
  Image,
  RefreshControl,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';

import COINS_DOLLAR from '@assets/images/saving/coins-dollar.png';
import COINS_GROWTH from '@assets/images/saving/coins-growth.png';
import COINS_SMALL from '@assets/images/saving/coins-small.png';
import COINS_STACK from '@assets/images/saving/coins-stack.png';

import type { SavingPlan } from '@/domain/savings/SavingPlan';
import { useFormatMoney } from '@/presentation/formatters/formatMoney';
import { errorMessage } from '@/presentation/i18n/errorMessageKey';
import { AppText } from '@/presentation/shared/components/AppText';
import { Button } from '@/presentation/shared/components/Button';
import { Card } from '@/presentation/shared/components/Card';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { InfoBanner } from '@/presentation/shared/components/InfoBanner';
import { Screen } from '@/presentation/shared/components/Screen';
import { colors, spacing } from '@/presentation/theme/tokens';

import { DurationSheet } from '../components/DurationSheet';
import { savingPlanName } from '../savingPlanName';
import { useSavingPlans } from '../useSavings';

/**
 * Choose a Saving Circle (COPAYNI-32): los planes con su monto objetivo y el cashback máximo; un
 * plan abre Choose Duration (COPAYNI-33). Sin el contexto de diseño (límite de Figma).
 */
export function SavingCirclesScreen() {
  const { t } = useTranslation();
  const catalog = useSavingPlans();
  const [selected, setSelected] = useState<SavingPlan | null>(null);

  if (catalog.isPending) {
    return (
      <Screen edges={['bottom']}>
        <ActivityIndicator accessibilityLabel={t('common.loading')} style={styles.center} />
      </Screen>
    );
  }
  if (catalog.isError && !catalog.data) {
    return (
      <Screen edges={['bottom']}>
        <View style={styles.center}>
          <AppText accessibilityRole="alert">{errorMessage(t, catalog.error)}</AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => void catalog.refetch()}
          />
        </View>
      </Screen>
    );
  }

  const { plans, durations } = catalog.data;
  return (
    <Screen edges={['bottom']}>
      <FlatList
        data={plans}
        keyExtractor={(plan) => plan.id}
        renderItem={({ item }) => <PlanCard plan={item} onPress={() => setSelected(item)} />}
        contentContainerStyle={styles.list}
        testID="saving-plans"
        ListHeaderComponent={
          <View style={styles.header}>
            {catalog.isError && (
              <InfoBanner message={t('saving.offline')} testID="saving-offline" />
            )}
            <AppText weight="semibold">{t('saving.chooseCircle.intro')}</AppText>
          </View>
        }
        ListEmptyComponent={
          <EmptyState title={t('saving.chooseCircle.empty')} testID="saving-empty" />
        }
        refreshControl={
          <RefreshControl
            refreshing={catalog.isRefetching}
            onRefresh={() => void catalog.refetch()}
          />
        }
      />
      <DurationSheet plan={selected} durations={durations} onClose={() => setSelected(null)} />
    </Screen>
  );
}

/** Ilustración de cada plan en el Figma 55:9164 (los planes menores repiten la imagen). */
const PLAN_ILLUSTRATION: Record<string, ImageSourcePropType> = {
  lite: COINS_SMALL,
  bronze: COINS_SMALL,
  silver: COINS_STACK,
  gold: COINS_STACK,
  platinum: COINS_DOLLAR,
  diamond: COINS_GROWTH,
};
const ILLUSTRATION_SIZE = 40;

function PlanCard({ plan, onPress }: { plan: SavingPlan; onPress: () => void }) {
  const { t } = useTranslation();
  const formatMoney = useFormatMoney();
  const name = savingPlanName(t, plan.id);
  const target = formatMoney(plan.target, { trimZeroDecimals: true });
  const amount = formatMoney(plan.maxCashback, { trimZeroDecimals: true });
  const extra = t('saving.chooseCircle.upTo', { amount }).replace(/<\/?amount>/g, '');
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${name}. ${target}. ${extra}`}
      testID={`saving-plan-${plan.id}`}
      style={styles.card}
    >
      <View style={styles.cardText}>
        <AppText variant="caption" style={styles.planName}>
          {name}
        </AppText>
        <AppText variant="highlight" weight="semibold">
          {target}
        </AppText>
        {/* Figma 55:9164: solo el monto del cashback va resaltado. */}
        <AppText variant="caption">
          <Trans
            i18nKey="saving.chooseCircle.upTo"
            values={{ amount }}
            components={{
              amount: <AppText variant="caption" weight="semibold" color={colors.success} />,
            }}
          />
        </AppText>
      </View>
      <Image
        source={PLAN_ILLUSTRATION[plan.id] ?? COINS_SMALL}
        style={styles.illustration}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg },
  list: { gap: spacing.m, paddingVertical: spacing.l },
  header: { gap: spacing.m },
  planName: { textTransform: 'uppercase' },
  card: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  cardText: { flex: 1, gap: spacing.xs },
  illustration: { width: ILLUSTRATION_SIZE, height: ILLUSTRATION_SIZE },
});
