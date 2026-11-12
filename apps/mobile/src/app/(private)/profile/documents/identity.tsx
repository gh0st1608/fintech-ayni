import { router } from 'expo-router';

import { IdentityVerificationScreen } from '@/presentation/documents/screens/IdentityVerificationScreen';

export default function IdentityVerificationRoute() {
  return (
    <IdentityVerificationScreen
      onManualUpload={() => router.replace('/profile/documents/national-id')}
      onCompleteProfile={() => router.push('/profile/personal-info')}
      onDone={() => router.back()}
    />
  );
}
