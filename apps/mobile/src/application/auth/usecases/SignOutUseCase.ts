import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';
import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { SessionStatus } from '@/domain/auth/SessionStatus';

export type SignOutReason = 'user' | 'expired';

/**
 * Cierra la sesión. El borrado local es inmediato y no depende de la red; si la cierra el
 * usuario, además se pide al backend revocar el refresh token en segundo plano (un fallo se
 * tolera: el token caduca solo). Si el borrado local falla el error se propaga: no se informa
 * una sesión cerrada mientras los tokens sigan guardados.
 */
export class SignOutUseCase {
  constructor(
    private readonly tokens: TokenStoragePort,
    private readonly authApi: AuthApiPort,
  ) {}

  async execute(reason: SignOutReason = 'user'): Promise<SessionStatus> {
    const refreshToken = reason === 'user' ? await this.readRefreshToken() : null;
    await this.tokens.clear();
    if (refreshToken) this.authApi.logout(refreshToken).catch(() => undefined);
    return reason === 'expired' ? 'sessionExpired' : 'unauthenticated';
  }

  private async readRefreshToken(): Promise<string | null> {
    try {
      return (await this.tokens.read())?.refreshToken ?? null;
    } catch {
      return null;
    }
  }
}
