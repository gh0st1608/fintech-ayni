import { DomainError } from '@/domain/shared/errors/DomainError';

export class InvalidPasscodeError extends DomainError {
  readonly code = 'INVALID_PASSCODE';
}

export class PasscodeMismatchError extends DomainError {
  readonly code = 'PASSCODE_MISMATCH';
}

export const PASSCODE_LENGTH = 6;
const PASSCODE_PATTERN = /^\d{6}$/;

/** Passcode de 6 dígitos (COPAYNI-23, supuesto de D9). Nunca se guarda ni se registra en logs. */
export class Passcode {
  private constructor(readonly value: string) {}

  static create(raw: string): Passcode {
    if (!PASSCODE_PATTERN.test(raw)) {
      throw new InvalidPasscodeError(`Passcode must have exactly ${PASSCODE_LENGTH} digits`);
    }
    return new Passcode(raw);
  }
}
