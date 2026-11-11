import { router, useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { useRefreshStartProposals } from '@/presentation/circles/components/StartProposals';
import { CirclesScreen } from '@/presentation/circles/screens/CirclesScreen';
import { useJoinFlow } from '@/presentation/join/JoinFlowProvider';

export default function CirclesRoute() {
  const { start } = useJoinFlow();
  const refreshProposals = useRefreshStartProposals();
  // La propuesta de inicio es el único aviso (COPAYNI-62): se recarga cada vez que se vuelve aquí.
  useFocusEffect(
    useCallback(() => {
      void refreshProposals();
    }, [refreshProposals]),
  );
  return (
    <CirclesScreen
      onJoin={() => router.push('/join')}
      onOpenCircle={(circleId) =>
        router.push({ pathname: '/circles/[circleId]', params: { circleId } })
      }
      onJoinCircle={(payout, target) => {
        start(payout, target);
        router.push('/join/payout-amount');
      }}
    />
  );
}
