import { router } from 'expo-router';

import { JoinScreen } from '@/presentation/join/screens/JoinScreen';

export default function JoinRoute() {
  return (
    <JoinScreen
      onJoinGameya={() => router.push('/join/payout-amount')}
      onJoinSavingProgram={() => router.push('/join/saving-program')}
    />
  );
}
