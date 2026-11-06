import { router } from 'expo-router';

import { ProfileScreen } from '@/presentation/profile/screens/ProfileScreen';

export default function ProfileRoute() {
  return (
    <ProfileScreen
      onOpenPersonalInfo={() => router.push('/profile/personal-info')}
      onOpenPasscode={() => router.push('/profile/passcode')}
      onOpenDocuments={() => router.push('/profile/documents')}
      onOpenReferral={() => router.push('/profile/referral')}
      onOpenCatalog={() => router.push('/catalog')}
    />
  );
}
