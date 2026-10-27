import { router } from 'expo-router';

import { PayoutAmountScreen } from '@/presentation/join/screens/PayoutAmountScreen';

export default function PayoutAmountRoute() {
  return <PayoutAmountScreen onNext={() => router.push('/join/monthly-pay-in')} />;
}
