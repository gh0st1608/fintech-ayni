import { router } from 'expo-router';

import { WelcomeScreen } from '@/presentation/auth/screens/WelcomeScreen';

export default function WelcomeRoute() {
  return <WelcomeScreen onContinue={() => router.push('/sign-in')} />;
}
