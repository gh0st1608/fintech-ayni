import { router, useLocalSearchParams } from 'expo-router';

import { ChangeContactScreen } from '@/presentation/profile/screens/ChangeContactScreen';

export default function ChangeContactRoute() {
  const { type } = useLocalSearchParams<{ type: string }>();
  // Solo email o teléfono; cualquier otro valor del deep link se trata como email.
  return (
    <ChangeContactScreen
      type={type === 'phone' ? 'phone' : 'email'}
      onChanged={() => router.back()}
    />
  );
}
