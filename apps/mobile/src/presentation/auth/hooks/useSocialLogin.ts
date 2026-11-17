import { useMutation, useQuery } from '@tanstack/react-query';

import { SOCIAL_PROVIDERS, type SocialProvider } from '@/domain/auth/SocialLogin';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { useSession } from '@/presentation/providers/SessionProvider';

export const availableProvidersQueryKey = ['auth', 'social', 'available'] as const;

/** Qué proveedores puede ofrecer este dispositivo; sin ninguno, la sección no se muestra. */
export function useAvailableProviders() {
  const { auth } = useContainer();
  return useQuery({
    queryKey: availableProvidersQueryKey,
    queryFn: () => auth.availableProviders.execute(SOCIAL_PROVIDERS),
    // El SDK no cambia mientras la app está abierta.
    staleTime: Infinity,
  });
}

/**
 * Entra con Google o Apple (COPAYNI-91). Cancelar no es un error: la mutación termina bien y la
 * pantalla no muestra nada, que es lo que la persona espera al cerrar el diálogo.
 */
export function useSocialLogin() {
  const { auth } = useContainer();
  const { completeSignIn } = useSession();
  return useMutation({
    mutationFn: (provider: SocialProvider) => auth.signInWithProvider.execute(provider),
    onSuccess: (outcome) => {
      if (outcome.status === 'authenticated') completeSignIn(outcome.session);
    },
  });
}
