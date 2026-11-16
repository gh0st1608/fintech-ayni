import {
  canRequestSignatureCode,
  isPendingSignature,
  type AgreementDocument,
  type AgreementDocumentText,
  type MembershipAgreement,
  type SignatureChallenge,
} from '@/domain/agreements/MembershipAgreement';
import {
  AgreementNotPendingError,
  DocumentsNotReadError,
} from '@/domain/agreements/errors/SignatureErrors';
import type { AgreementRepositoryPort } from '@/domain/agreements/ports/AgreementRepositoryPort';

/** Mis contratos y pagarés y su estado (GET /me/agreements). */
export class ListAgreementsUseCase {
  constructor(private readonly agreements: AgreementRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<MembershipAgreement[]> {
    return this.agreements.list(signal);
  }
}

/** Los que todavía hay que firmar, lo que bloquea que la unión quede firme. */
export class ListPendingAgreementsUseCase {
  constructor(private readonly agreements: AgreementRepositoryPort) {}

  async execute(signal?: AbortSignal): Promise<MembershipAgreement[]> {
    return (await this.agreements.list(signal)).filter(isPendingSignature);
  }
}

/** Abre un documento: devuelve el texto firmado y lo marca leído. */
export class ReadAgreementDocumentUseCase {
  constructor(private readonly agreements: AgreementRepositoryPort) {}

  execute(
    agreementId: string,
    document: AgreementDocument,
    signal?: AbortSignal,
  ): Promise<AgreementDocumentText> {
    return this.agreements.readDocument(agreementId, document, signal);
  }
}

/**
 * Pide el código de firma. Se adelanta a las dos reglas del backend para no gastar un viaje ni
 * un SMS cuando ya se sabe que va a fallar: el acuerdo tiene que estar pendiente y los dos
 * documentos leídos.
 */
export class RequestSignatureCodeUseCase {
  constructor(private readonly agreements: AgreementRepositoryPort) {}

  execute(agreement: MembershipAgreement): Promise<SignatureChallenge> {
    if (!isPendingSignature(agreement)) throw new AgreementNotPendingError(agreement.status);
    if (!canRequestSignatureCode(agreement)) throw new DocumentsNotReadError(agreement.unread);
    return this.agreements.requestSignatureCode(agreement.id);
  }
}

/** Firma el contrato y el pagaré con el código; el backend firma los dos en una transacción. */
export class SignAgreementUseCase {
  constructor(private readonly agreements: AgreementRepositoryPort) {}

  execute(agreementId: string, code: string): Promise<MembershipAgreement> {
    return this.agreements.sign(agreementId, code);
  }
}
