import { router } from 'expo-router';

import { PayoutMethodScreen } from '@/presentation/join/screens/PayoutMethodScreen';

export default function PayoutMethodRoute() {
  return (
    <PayoutMethodScreen
      onStartOver={() => router.dismissTo('/join/payout-amount')}
      onNext={() => router.push('/join/confirm')}
    />
  );
}
