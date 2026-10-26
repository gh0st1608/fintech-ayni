import { Redirect } from 'expo-router';

import { useSession } from '@/presentation/providers/SessionProvider';

/** Ruta ancla: envía al área privada o pública según el estado de sesión. */
export default function Index() {
  const { status } = useSession();
  return <Redirect href={status === 'authenticated' ? '/home' : '/welcome'} />;
}
