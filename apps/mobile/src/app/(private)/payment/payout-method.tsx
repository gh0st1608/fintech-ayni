import { router } from 'expo-router';

import { ChangePayoutMethodScreen } from '@/presentation/payment/screens/ChangePayoutMethodScreen';

export default function ChangePayoutMethodRoute() {
  return <ChangePayoutMethodScreen onSaved={() => router.back()} />;
}
