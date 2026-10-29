import { router } from 'expo-router';

import { useJoinFlow } from '@/presentation/join/JoinFlowProvider';
import { HomeScreen } from '@/presentation/home/screens/HomeScreen';

export default function HomeRoute() {
  const { start } = useJoinFlow();
  return (
    <HomeScreen
      onJoinCircle={(payout, target) => {
        // "Join now" empieza el flujo con el monto del círculo (paso 1 precargado).
        start(payout, target);
        router.push('/join/payout-amount');
      }}
      onJoin={() => router.push('/join')}
    />
  );
}
