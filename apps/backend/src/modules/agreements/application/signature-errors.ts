import { DomainError } from '../../../shared/errors/app-error';
import { type SignatureOutcome } from '../domain/signature-challenge';

export class SignatureCodeInvalidError extends DomainError {
  constructor(attemptsRemaining: number) {
    super('SIGNATURE_CODE_INVALID', 'El código es incorrecto', {
      attemptsRemaining: String(attemptsRemaining),
    });
  }
}

/** También cubre un desafío inexistente o ya usado: hay que pedir otro código. */
export class SignatureCodeExpiredError extends DomainError {
  constructor() {
    super('SIGNATURE_CODE_EXPIRED', 'El código venció; pide uno nuevo');
  }
}

export class SignatureAttemptsExceededError extends DomainError {
  constructor() {
    super('SIGNATURE_ATTEMPTS_EXCEEDED', 'Agotaste los intentos; pide un código nuevo');
  }
}

/** Traduce un resultado que no es éxito al error del contrato (como `verificationError` del login). */
export function signatureError(
  outcome: Exclude<SignatureOutcome, { kind: 'verified' }>,
): DomainError {
  switch (outcome.kind) {
    case 'invalid':
      return new SignatureCodeInvalidError(outcome.attemptsRemaining);
    case 'attempts_exceeded':
      return new SignatureAttemptsExceededError();
    case 'expired':
      return new SignatureCodeExpiredError();
  }
}
