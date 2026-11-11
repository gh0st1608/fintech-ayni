import { router, useLocalSearchParams } from 'expo-router';

import { CircleDetailScreen } from '@/presentation/circles/screens/CircleDetailScreen';

export default function CircleDetailRoute() {
  const { circleId } = useLocalSearchParams<{ circleId: string }>();
  return (
    <CircleDetailScreen
      circleId={circleId}
      onPay={(installmentId) =>
        router.push({ pathname: '/payment/pay/[installmentId]', params: { installmentId } })
      }
    />
  );
}
