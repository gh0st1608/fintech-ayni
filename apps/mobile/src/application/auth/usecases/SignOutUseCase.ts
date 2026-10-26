import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { SessionStatus } from '@/domain/auth/SessionStatus';

export type SignOutReason = 'user' | 'expired';

/**
 * Cierra la sesión eliminando las credenciales del dispositivo. Si el borrado falla el error
 * se propaga: no se informa una sesión cerrada mientras los tokens sigan almacenados.
 */
export class SignOutUseCase {
  constructor(private readonly tokens: TokenStoragePort) {}

  async execute(reason: SignOutReason = 'user'): Promise<SessionStatus> {
    await this.tokens.clear();
    return reason === 'expired' ? 'sessionExpired' : 'unauthenticated';
  }
}
