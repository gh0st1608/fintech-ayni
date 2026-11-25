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
        router.push('/join/frequency');
      }}
      onJoin={() => router.push('/join')}
      onOpenReferral={() => router.push('/profile/referral')}
      onOpenNotifications={() => router.push('/notifications')}
      onOpenContent={{
        // Destinos del contenido de Home (COPAYNI-25); unirse ya lo resuelve onJoinCircle.
        savingsPlans: () => router.push('/join/saving-program'),
        referral: () => router.push('/profile/referral'),
        help: () => router.push('/payment/help'),
      }}
    />
  );
}
