import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import type { Money } from '@/domain/shared/value-objects/Money';
import { RecommendedCircles } from '@/presentation/circles/components/RecommendedCircles';
import { recommendedCirclesQueryKey } from '@/presentation/circles/useRecommendedCircles';
import { AppText } from '@/presentation/shared/components/AppText';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { spacing } from '@/presentation/theme/tokens';

interface HomeScreenProps {
  /** "Únete ahora" de un recomendado: el flujo de unión con ese payout precargado. */
  onJoinCircle: (payout: Money) => void;
  /** Sin recomendados: el flujo de unión desde "Elige un servicio". */
  onJoin: () => void;
}

/**
 * Home (Figma 55:8637 y 55:8853). Por ahora solo "Recomendados para ti" (COPAYNI-25):
 * - Las ofertas y las metas populares no tienen de dónde salir (CMS o back-office, D13).
 * - El banner de invitación espera las reglas de referidos (R7).
 * Cada sección tendrá su query, para que un error no bloquee las demás.
 */
export function HomeScreen({ onJoinCircle, onJoin }: HomeScreenProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ queryKey: recommendedCirclesQueryKey });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        testID="home"
      >
        <AppText variant="highlight" weight="semibold" accessibilityRole="header">
          {t('home.title')}
        </AppText>
        <RecommendedCircles
          onJoin={onJoinCircle}
          emptyFallback={
            <EmptyState
              title={t('home.empty.title')}
              description={t('home.empty.description')}
              action={{ label: t('home.empty.join'), onPress: onJoin }}
              testID="home-empty"
            />
          }
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
