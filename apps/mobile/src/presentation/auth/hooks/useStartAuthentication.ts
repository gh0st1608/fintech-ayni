import { useMutation, useQuery } from '@tanstack/react-query';

import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import { useContainer } from '@/presentation/providers/ContainerProvider';

/** Pide el OTP para el email o teléfono ingresado (POST /auth/start). */
export function useStartAuthentication() {
  const { auth } = useContainer();
  return useMutation<AuthChallenge, Error, string>({
    mutationFn: (identifier) => auth.startAuthentication.execute(identifier),
  });
}

export const availableChannelsQueryKey = ['auth', 'channels'] as const;

/**
 * Canales por los que el backend puede entregar el código (pending-scope T6). Sin respuesta no se
 * bloquea nada: quien decide es el servidor, y mientras tanto la pantalla no estorba.
 */
export function useAvailableChannels() {
  const { auth } = useContainer();
  return useQuery({
    queryKey: availableChannelsQueryKey,
    queryFn: ({ signal }) => auth.availableChannels.execute(signal),
    // La configuración del backend no cambia mientras la app está abierta.
    staleTime: Infinity,
  });
}
