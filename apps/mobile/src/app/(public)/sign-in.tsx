import { router } from 'expo-router';

import { toChallengeParams } from '@/presentation/auth/challengeParams';
import { useAvailableChannels } from '@/presentation/auth/hooks/useStartAuthentication';
import { SignInScreen } from '@/presentation/auth/screens/SignInScreen';

export default function SignInRoute() {
  // La consulta vive en la ruta; la pantalla solo pinta lo que recibe.
  const channels = useAvailableChannels().data;
  return (
    <SignInScreen
      channels={channels}
      onChallengeStarted={(challenge) =>
        router.push({ pathname: '/verify-otp', params: toChallengeParams(challenge) })
      }
    />
  );
}
