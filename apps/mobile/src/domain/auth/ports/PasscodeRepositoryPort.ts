import type { Passcode } from '@/domain/auth/value-objects/Passcode';

/** Passcode de acceso (docs/api/me.md). El backend guarda el hash y limita los intentos. */
export interface PasscodeRepositoryPort {
  isConfigured(signal?: AbortSignal): Promise<boolean>;
  /** Crea el passcode o, con `current`, lo cambia. */
  save(next: Passcode, current?: Passcode): Promise<void>;
  verify(passcode: Passcode): Promise<void>;
}
