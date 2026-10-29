import { router } from 'expo-router';

import { CirclesScreen } from '@/presentation/circles/screens/CirclesScreen';

export default function CirclesRoute() {
  return <CirclesScreen onJoin={() => router.push('/join')} />;
}
