import { useMutation } from '@tanstack/react-query';

import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import { useContainer } from '@/presentation/providers/ContainerProvider';

/** Pide el OTP para el email o teléfono ingresado (POST /auth/start). */
export function useStartAuthentication() {
  const { auth } = useContainer();
  return useMutation<AuthChallenge, Error, string>({
    mutationFn: (identifier) => auth.startAuthentication.execute(identifier),
  });
}
