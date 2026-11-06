import { router } from 'expo-router';

import { PasscodeScreen } from '@/presentation/profile/screens/PasscodeScreen';

export default function PasscodeRoute() {
  return <PasscodeScreen onDone={() => router.back()} />;
}
