import { useMutation } from '@tanstack/react-query';

import type { VerifyOtpInput } from '@/application/auth/usecases/VerifyOtpUseCase';
import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import type { SessionStatus } from '@/domain/auth/SessionStatus';
import { useContainer } from '@/presentation/providers/ContainerProvider';
import { useSession } from '@/presentation/providers/SessionProvider';

/** Canjea el OTP por la sesión y la abre en el SessionProvider (POST /auth/verify). */
export function useVerifyOtp() {
  const { auth } = useContainer();
  const { completeSignIn } = useSession();
  return useMutation<SessionStatus, Error, VerifyOtpInput>({
    mutationFn: (input) => auth.verifyOtp.execute(input),
    onSuccess: completeSignIn,
  });
}

/** Pide un código nuevo (POST /auth/resend). */
export function useResendOtp() {
  const { auth } = useContainer();
  return useMutation<AuthChallenge, Error, string>({
    mutationFn: (challengeId) => auth.resendOtp.execute(challengeId),
  });
}
