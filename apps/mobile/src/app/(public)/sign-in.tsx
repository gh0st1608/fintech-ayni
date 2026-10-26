import { router } from 'expo-router';

import { toChallengeParams } from '@/presentation/auth/challengeParams';
import { SignInScreen } from '@/presentation/auth/screens/SignInScreen';

export default function SignInRoute() {
  return (
    <SignInScreen
      onChallengeStarted={(challenge) =>
        router.push({ pathname: '/verify-otp', params: toChallengeParams(challenge) })
      }
    />
  );
}
