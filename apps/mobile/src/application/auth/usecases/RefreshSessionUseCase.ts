import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';
import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import { AppError } from '@/domain/shared/errors/AppError';

import type { SessionEvents } from '../SessionEvents';
import type { SignOutUseCase } from './SignOutUseCase';

/**
 * Renueva el par de tokens sin bucles (COPAYNI-21):
 * - una sola renovación en vuelo; las peticiones concurrentes esperan la misma;
 * - si el backend rechaza el refresh token, la sesión expira y no se vuelve a intentar;
 * - un fallo transitorio (red, timeout) se propaga sin cerrar la sesión.
 */
export class RefreshSessionUseCase {
  private inFlight: Promise<boolean> | null = null;

  constructor(
    private readonly authApi: AuthApiPort,
    private readonly tokens: TokenStoragePort,
    private readonly signOut: SignOutUseCase,
    private readonly events: SessionEvents,
  ) {}

  /** true si hay tokens nuevos guardados; false si la sesión expiró. */
  execute(): Promise<boolean> {
    this.inFlight ??= this.renew().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Cierra la sesión como expirada y avisa a la UI. Nunca intenta renovar. */
  async expire(): Promise<void> {
    try {
      await this.signOut.execute('expired');
    } finally {
      this.events.emit('sessionExpired');
    }
  }

  private async renew(): Promise<boolean> {
    const current = await this.tokens.read();
    if (!current) {
      await this.expire();
      return false;
    }
    try {
      // Sin `persist`: la sesión rotada conserva la elección de "Remember Me".
      await this.tokens.save(await this.authApi.refreshSession(current.refreshToken));
      return true;
    } catch (error) {
      if (error instanceof AppError && error.isTransient) throw error;
      await this.expire();
      return false;
    }
  }
}
