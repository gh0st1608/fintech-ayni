import { router } from 'expo-router';

import { HelpScreen } from '@/presentation/help/HelpScreen';

export default function HelpRoute() {
  return <HelpScreen onOpenPolicy={() => router.push('/payment/policy')} />;
}
