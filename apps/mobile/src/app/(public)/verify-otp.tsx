import { Redirect, useLocalSearchParams } from 'expo-router';

import { fromChallengeParams } from '@/presentation/auth/challengeParams';
import { VerifyOtpScreen } from '@/presentation/auth/screens/VerifyOtpScreen';

export default function VerifyOtpRoute() {
  const challenge = fromChallengeParams(useLocalSearchParams());
  if (!challenge) return <Redirect href="/sign-in" />;
  return <VerifyOtpScreen challenge={challenge} />;
}
