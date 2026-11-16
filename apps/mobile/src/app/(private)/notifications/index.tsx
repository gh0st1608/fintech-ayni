import { router } from 'expo-router';

import { NotificationsScreen } from '@/presentation/notifications/NotificationsScreen';

export default function NotificationsRoute() {
  return (
    <NotificationsScreen
      onOpen={(target) => {
        if (target.screen === 'circle') router.push(`/circles/${target.circleId}`);
        else if (target.screen === 'documents') router.push('/profile/documents');
        else router.push('/payment/history');
      }}
    />
  );
}
