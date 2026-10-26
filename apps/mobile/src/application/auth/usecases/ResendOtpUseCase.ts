import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';

/** Pide un código nuevo; el backend invalida el anterior y fija el próximo reenvío permitido. */
export class ResendOtpUseCase {
  constructor(private readonly authApi: AuthApiPort) {}

  execute(challengeId: string, signal?: AbortSignal): Promise<AuthChallenge> {
    return this.authApi.resendOtp(challengeId, signal);
  }
}
