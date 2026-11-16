/** Los dos documentos que se firman al unirse a un círculo (COPAYNI-89). */
export const AGREEMENT_DOCUMENTS = ['contract', 'promissoryNote'] as const;
export type AgreementDocument = (typeof AGREEMENT_DOCUMENTS)[number];

/** `pending`: dentro del plazo para firmar. `expired`: venció y el turno se liberó. */
export type AgreementStatus = 'pending' | 'signed' | 'expired';

/**
 * Contrato y pagaré de una membresía (docs/api/agreements.md). Mientras está `pending` el turno
 * queda **reservado, no firme**: si el plazo vence sin firma, la tarea diaria lo libera.
 */
export interface MembershipAgreement {
  id: string;
  circleId: string;
  position: number;
  status: AgreementStatus;
  expiresAt: Date;
  signedAt: Date | null;
  /** Lo que falta leer; hay que abrir los dos documentos antes de pedir el código. */
  unread: AgreementDocument[];
}

/** El texto que la persona leyó y firmó, no la plantilla vigente: es la evidencia. */
export interface AgreementDocumentText {
  document: AgreementDocument;
  version: string;
  text: string;
  /** SHA-256 del texto, lo que queda guardado como evidencia de la firma. */
  hash: string;
  readAt: Date;
}

/** Desafío del código de firma; mismos plazos y reenvíos que el OTP del login (R10). */
export interface SignatureChallenge {
  challengeId: string;
  maskedDestination: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

export const isPendingSignature = (agreement: MembershipAgreement): boolean =>
  agreement.status === 'pending';

/** Se puede pedir el código: sigue pendiente y ya leyó los dos documentos. */
export const canRequestSignatureCode = (agreement: MembershipAgreement): boolean =>
  isPendingSignature(agreement) && agreement.unread.length === 0;
