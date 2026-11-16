import { ConflictError, DomainError } from '../../../shared/errors/app-error';

/**
 * Los dos documentos que se firman al unirse a un Game'ya (COPAYNI-89, pending-scope D3):
 * el contrato del círculo y el pagaré que respalda la deuda por impago (R3 y §3.1).
 */
export const AGREEMENT_DOCUMENTS = ['contract', 'promissory_note'] as const;
export type AgreementDocument = (typeof AGREEMENT_DOCUMENTS)[number];

/**
 * `pending`: creado al unirse, dentro del plazo de firma. `signed`: ambos documentos firmados con
 * su evidencia. `expired`: venció el plazo sin firmar y el turno se liberó.
 */
export const AGREEMENT_STATUSES = ['pending', 'signed', 'expired'] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

/** Un documento del acuerdo: el texto exacto que se firma, su versión y su hash. */
export interface AgreementDocumentState {
  readonly version: string;
  /** Texto canónico renderizado al unirse: es lo que la persona lee y firma. */
  readonly text: string;
  /** SHA-256 del texto: comprobación de integridad y referencia en la evidencia. */
  readonly hash: string;
  readonly readAt: Date | null;
}

export interface MembershipAgreement {
  readonly id: string;
  readonly userId: string;
  readonly circleId: string;
  readonly position: number;
  readonly contract: AgreementDocumentState;
  readonly promissoryNote: AgreementDocumentState;
  readonly status: AgreementStatus;
  readonly createdAt: Date;
  /** Plazo para firmar; vencido, el turno se libera (COPAYNI-89, 48 h por defecto). */
  readonly expiresAt: Date;
  readonly signedAt: Date | null;
}

/** Falta leer alguno de los documentos: no se puede pedir el código de firma. */
export class DocumentsNotReadError extends DomainError {
  constructor(pending: AgreementDocument[]) {
    super('AGREEMENT_DOCUMENTS_NOT_READ', 'Lee los dos documentos antes de firmarlos', {
      pending: pending.join(','),
    });
  }
}

/** Ya se firmó, o el plazo venció y el turno se liberó. */
export class AgreementNotPendingError extends ConflictError {
  constructor(status: AgreementStatus) {
    super('AGREEMENT_NOT_PENDING', 'Este acuerdo ya no se puede firmar', { status });
  }
}

/** Si el plazo de firma ya pasó. Un acuerdo firmado nunca vence. */
export function isExpired(agreement: MembershipAgreement, now: Date): boolean {
  return agreement.status === 'pending' && now >= agreement.expiresAt;
}

/** El estado efectivo: `pending` vencido cuenta como `expired` aunque la tarea no haya corrido. */
export function effectiveStatus(agreement: MembershipAgreement, now: Date): AgreementStatus {
  return isExpired(agreement, now) ? 'expired' : agreement.status;
}

/** Documentos que todavía no se leyeron, en el orden en que se muestran. */
export function unreadDocuments(agreement: MembershipAgreement): AgreementDocument[] {
  const pending: AgreementDocument[] = [];
  if (agreement.contract.readAt === null) pending.push('contract');
  if (agreement.promissoryNote.readAt === null) pending.push('promissory_note');
  return pending;
}

/**
 * Que el acuerdo siga firmable: ni firmado ni vencido. Lo comprueban pedir el código y firmar,
 * porque entre una cosa y la otra el plazo puede haber pasado.
 */
export function assertPending(agreement: MembershipAgreement, now: Date): void {
  const status = effectiveStatus(agreement, now);
  if (status !== 'pending') throw new AgreementNotPendingError(status);
}

/**
 * Que se pueda pedir el código de firma: el acuerdo sigue vigente y los dos documentos se
 * leyeron (criterio de aceptación de COPAYNI-89: sin leer, no hay código).
 */
export function assertReadyToSign(agreement: MembershipAgreement, now: Date): void {
  assertPending(agreement, now);
  const unread = unreadDocuments(agreement);
  if (unread.length > 0) throw new DocumentsNotReadError(unread);
}
