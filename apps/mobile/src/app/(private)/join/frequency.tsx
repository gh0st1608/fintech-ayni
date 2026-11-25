import { router } from 'expo-router';

import { FrequencyScreen } from '@/presentation/join/screens/FrequencyScreen';

export default function FrequencyRoute() {
  return <FrequencyScreen onNext={() => router.push('/join/payout-amount')} />;
}
