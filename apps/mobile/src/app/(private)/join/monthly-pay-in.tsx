import { router } from 'expo-router';

import { MonthlyPayInScreen } from '@/presentation/join/screens/MonthlyPayInScreen';

export default function MonthlyPayInRoute() {
  return (
    <MonthlyPayInScreen
      onEdit={() => router.dismissTo('/join/payout-amount')}
      onNext={() => router.push('/join/slot')}
    />
  );
}
