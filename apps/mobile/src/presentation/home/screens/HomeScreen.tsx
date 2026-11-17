import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';

import { Money } from '@/domain/shared/value-objects/Money';
import { RecommendedCircles } from '@/presentation/circles/components/RecommendedCircles';
import { HomeGoals, HomeOffers } from '@/presentation/home/components/HomeContentSections';
import { homeContentQueryKey } from '@/presentation/home/useHomeContent';
import { ReferralBanner } from '@/presentation/referrals/components/ReferralBanner';
import { myReferralQueryKey } from '@/presentation/referrals/useReferrals';
import { recommendedCirclesQueryKey } from '@/presentation/circles/useRecommendedCircles';
import {
  PaymentStreakButton,
  paymentStreakQueryKey,
} from '@/presentation/home/components/PaymentStreakButton';
import { NotificationBell } from '@/presentation/notifications/NotificationBell';
import { unreadNotificationsQueryKey } from '@/presentation/notifications/useNotifications';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { BrandHeader } from '@/presentation/shared/components/BrandHeader';
import { EmptyState } from '@/presentation/shared/components/EmptyState';
import { Screen } from '@/presentation/shared/components/Screen';
import { spacing } from '@/presentation/theme/tokens';
import type { JoinTarget } from '@/domain/circles/RecommendedCircle';
import type { HomeItem } from '@/domain/home/HomeContent';

interface HomeScreenProps {
  /** "Únete ahora" de un recomendado: el flujo de unión con ese payout precargado. */
  onJoinCircle: (payout: Money, target?: JoinTarget) => void;
  /** Sin recomendados: el flujo de unión desde "Elige un servicio". */
  onJoin: () => void;
  /** Banner de invitación: abre "Invita a un amigo". */
  onOpenReferral?: () => void;
  /** La campana del header: abre la bandeja (COPAYNI-84). */
  onOpenNotifications?: () => void;
  /**
   * Destinos del contenido de Home que no son unirse a una junta (COPAYNI-25). Unirse reutiliza
   * `onJoinCircle` y `onJoin`, que ya saben precargar el monto.
   */
  onOpenContent?: Partial<Record<'savingsPlans' | 'referral' | 'help', () => void>>;
}

/**
 * Home (Figma 55:8637 y 55:8853): ofertas, banner de invitación (COPAYNI-51), "Recomendados para
 * ti" y metas populares (COPAYNI-25). Las ofertas y las metas las carga el back-office; sin
 * contenido, esas secciones no se muestran. Cada sección tiene su query, para que un error no
 * bloquee las demás.
 */
export function HomeScreen({
  onJoinCircle,
  onJoin,
  onOpenReferral,
  onOpenNotifications,
  onOpenContent,
}: HomeScreenProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { defaultCurrency } = useContainer().config;
  const [refreshing, setRefreshing] = useState(false);

  /** Una tarjeta de contenido lleva a su pantalla; unirse precarga el monto si lo trae. */
  const openContent = (item: HomeItem) => {
    if (item.target === 'joinCircle') {
      if (item.targetAmount === null) onJoin();
      else onJoinCircle(Money.of(item.targetAmount, defaultCurrency));
      return;
    }
    // `none` no es pulsable: la sección ni siquiera llama aquí.
    if (item.target !== 'none') onOpenContent?.[item.target]?.();
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: recommendedCirclesQueryKey }),
        queryClient.refetchQueries({ queryKey: myReferralQueryKey }),
        queryClient.refetchQueries({ queryKey: paymentStreakQueryKey }),
        queryClient.refetchQueries({ queryKey: unreadNotificationsQueryKey }),
        queryClient.refetchQueries({ queryKey: homeContentQueryKey }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Screen>
      <BrandHeader
        actions={
          <>
            <PaymentStreakButton />
            {onOpenNotifications && <NotificationBell onPress={onOpenNotifications} />}
          </>
        }
      />
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        testID="home"
      >
        <HomeOffers onOpen={openContent} />
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
        <HomeGoals onOpen={openContent} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.l, paddingVertical: spacing.l },
});
