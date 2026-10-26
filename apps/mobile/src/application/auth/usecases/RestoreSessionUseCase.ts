import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { SessionStatus } from '@/domain/auth/SessionStatus';

/** Determina el estado de sesión al arrancar la app a partir de los tokens guardados. */
export class RestoreSessionUseCase {
  constructor(private readonly tokens: TokenStoragePort) {}

  async execute(): Promise<SessionStatus> {
    try {
      return (await this.tokens.read()) ? 'authenticated' : 'unauthenticated';
    } catch {
      // Un almacén ilegible equivale a no tener sesión: se pide volver a autenticarse.
      return 'unauthenticated';
    }
  }
}
