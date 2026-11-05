import type { PasscodeRepositoryPort } from '@/domain/auth/ports/PasscodeRepositoryPort';
import { Passcode, PasscodeMismatchError } from '@/domain/auth/value-objects/Passcode';

export class GetPasscodeStatusUseCase {
  constructor(private readonly passcodes: PasscodeRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<boolean> {
    return this.passcodes.isConfigured(signal);
  }
}

export interface ChangePasscodeInput {
  /** Solo si ya tiene uno. */
  current?: string;
  next: string;
  confirmation: string;
}

/** Valida el formato y la confirmación antes de llamar al backend (COPAYNI-23). */
export class ChangePasscodeUseCase {
  constructor(private readonly passcodes: PasscodeRepositoryPort) {}

  execute({ current, next, confirmation }: ChangePasscodeInput): Promise<void> {
    const passcode = Passcode.create(next);
    if (next !== confirmation) throw new PasscodeMismatchError('Passcodes do not match');
    return this.passcodes.save(
      passcode,
      current === undefined ? undefined : Passcode.create(current),
    );
  }
}

/** Método alternativo de la pantalla de bloqueo. Quien decide si es correcto es el backend. */
export class UnlockWithPasscodeUseCase {
  constructor(private readonly passcodes: PasscodeRepositoryPort) {}

  execute(raw: string): Promise<void> {
    return this.passcodes.verify(Passcode.create(raw));
  }
}
