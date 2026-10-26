import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';
import { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';

/** Valida el email o teléfono y pide el OTP. Un formato inválido nunca llega a la red. */
export class StartAuthenticationUseCase {
  constructor(private readonly authApi: AuthApiPort) {}

  async execute(rawIdentifier: string, signal?: AbortSignal): Promise<AuthChallenge> {
    const identifier = LoginIdentifier.create(rawIdentifier);
    return this.authApi.startAuthentication(identifier, signal);
  }
}
