import type { BiometricPreferencePort } from '@/domain/auth/ports/BiometricPorts';
import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import type { SessionStatus } from '@/domain/auth/SessionStatus';

/** Determina el estado de sesión al arrancar la app a partir de los tokens guardados. */
export class RestoreSessionUseCase {
  constructor(
    private readonly tokens: TokenStoragePort,
    private readonly biometricPreference: BiometricPreferencePort,
  ) {}

  async execute(): Promise<SessionStatus> {
    try {
      if (!(await this.tokens.read())) return 'unauthenticated';
    } catch {
      // Un almacén ilegible equivale a no tener sesión: se pide volver a autenticarse.
      return 'unauthenticated';
    }
    return (await this.requiresUnlock()) ? 'locked' : 'authenticated';
  }

  private async requiresUnlock(): Promise<boolean> {
    try {
      return await this.biometricPreference.isEnabled();
    } catch {
      // Sin saber si estaba activada, se bloquea: desde ahí siempre se puede volver a ingresar.
      return true;
    }
  }
}
