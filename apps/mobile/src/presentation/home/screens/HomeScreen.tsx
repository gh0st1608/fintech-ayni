import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import type { Money } from '@/domain/shared/value-objects/Money';
import { RecommendedCircles } from '@/presentation/circles/components/RecommendedCircles';
import { ReferralBanner } from '@/presentation/referrals/components/ReferralBanner';
import { myReferralQueryKey } from '@/presentation/referrals/useReferrals';
import { recommendedCirclesQueryKey } from '@/presentation/circles/useRecommendedCircles';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { spacing } from '@/presentation/theme/tokens';
import type { JoinTarget } from '@/domain/circles/RecommendedCircle';

interface HomeScreenProps {
  /** "Únete ahora" de un recomendado: el flujo de unión con ese payout precargado. */
  onJoinCircle: (payout: Money, target?: JoinTarget) => void;
  /** Sin recomendados: el flujo de unión desde "Elige un servicio". */
  onJoin: () => void;
  /** Banner de invitación: abre "Invita a un amigo". */
  onOpenReferral?: () => void;
}

/**
 * Home (Figma 55:8637 y 55:8853): el banner de invitación (COPAYNI-51) y "Recomendados para ti"
 * (COPAYNI-25). Las ofertas y las metas populares no tienen de dónde salir (CMS o back-office,
 * D13). Cada sección tiene su query, para que un error no bloquee las demás.
 */
export function HomeScreen({ onJoinCircle, onJoin, onOpenReferral }: HomeScreenProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: recommendedCirclesQueryKey }),
        queryClient.refetchQueries({ queryKey: myReferralQueryKey }),
      ]);
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
        {onOpenReferral && <ReferralBanner onPress={onOpenReferral} />}
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
