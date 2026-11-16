import { DomainError } from '@/domain/shared/errors/DomainError';

import type { AgreementDocument, AgreementStatus } from '../MembershipAgreement';

export type SignatureRejectionReason = 'invalid' | 'expired' | 'attempts_exceeded';

/** El backend rechazó el código de firma: incorrecto, vencido o con los intentos agotados. */
export class SignatureRejectedError extends DomainError {
  readonly code = 'SIGNATURE_REJECTED';

  constructor(
    readonly reason: SignatureRejectionReason,
    readonly attemptsRemaining?: number,
  ) {
    super(`Signature code rejected: ${reason}`);
  }

  /** Un código vencido o bloqueado solo se recupera pidiendo uno nuevo. */
  get requiresResend(): boolean {
    return this.reason !== 'invalid';
  }
}

/** Faltan documentos por leer: no se puede pedir el código todavía. */
export class DocumentsNotReadError extends DomainError {
  readonly code = 'AGREEMENT_DOCUMENTS_NOT_READ';

  constructor(readonly pending: AgreementDocument[]) {
    super(`Agreement documents not read: ${pending.join(', ')}`);
  }
}

/** El acuerdo ya se firmó o su plazo venció: no admite firma. */
export class AgreementNotPendingError extends DomainError {
  readonly code = 'AGREEMENT_NOT_PENDING';

  constructor(readonly status: AgreementStatus) {
    super(`Agreement is not pending: ${status}`);
  }
}
