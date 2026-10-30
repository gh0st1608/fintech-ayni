import { router } from 'expo-router';

import { PersonalInfoScreen } from '@/presentation/profile/screens/PersonalInfoScreen';

export default function PersonalInfoRoute() {
  return (
    <PersonalInfoScreen
      onChangeContact={(type) =>
        router.push({ pathname: '/profile/contact/[type]', params: { type } })
      }
    />
  );
}
