import { router } from 'expo-router';

import { SlotScreen } from '@/presentation/join/screens/SlotScreen';

export default function SlotRoute() {
  return (
    <SlotScreen
      onEditPayout={() => router.dismissTo('/join/payout-amount')}
      onEditInstallment={() => router.dismissTo('/join/monthly-pay-in')}
      onNext={() => router.push('/join/payout-method')}
    />
  );
}
