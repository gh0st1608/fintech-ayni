import { router } from 'expo-router';

import { ProfileScreen } from '@/presentation/profile/screens/ProfileScreen';

export default function ProfileRoute() {
  return <ProfileScreen onOpenCatalog={() => router.push('/catalog')} />;
}
