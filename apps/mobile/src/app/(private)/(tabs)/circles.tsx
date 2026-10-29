import { router } from 'expo-router';

import { CirclesScreen } from '@/presentation/circles/screens/CirclesScreen';
import { useJoinFlow } from '@/presentation/join/JoinFlowProvider';

export default function CirclesRoute() {
  const { start } = useJoinFlow();
  return (
    <CirclesScreen
      onJoin={() => router.push('/join')}
      onJoinCircle={(payout, target) => {
        start(payout, target);
        router.push('/join/payout-amount');
      }}
    />
  );
}
