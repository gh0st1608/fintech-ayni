import { Redirect, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

import { useContainer } from '@/presentation/providers/ContainerProvider';

/**
 * Enlace de invitación (ayni://invite?code=…, COPAYNI-51): guarda el código validado hasta que
 * haya sesión y sigue a la ruta ancla. Un código mal formado se ignora sin romper la navegación.
 */
export default function InviteRoute() {
  const { code } = useLocalSearchParams<{ code?: string | string[] }>();
  const { capturePending } = useContainer().referrals;
  useEffect(() => {
    void capturePending.execute(code);
  }, [capturePending, code]);
  return <Redirect href="/" />;
}
