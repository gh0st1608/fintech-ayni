import { router } from 'expo-router';

import { ProfileScreen } from '@/presentation/profile/screens/ProfileScreen';

export default function ProfileRoute() {
  return (
    <ProfileScreen
      onOpenPersonalInfo={() => router.push('/profile/personal-info')}
      onOpenCatalog={() => router.push('/catalog')}
    />
  );
}
