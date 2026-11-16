import { type AgreementDocument, type MembershipAgreement } from '../domain/agreement';
import { type SignatureChallenge } from '../domain/signature-challenge';

export const AGREEMENTS = Symbol('AGREEMENTS');
export const SIGNATURE_CHALLENGES = Symbol('SIGNATURE_CHALLENGES');
export const AGREEMENT_SETTINGS = Symbol('AGREEMENT_SETTINGS');

/** Parámetros de la firma, desde la configuración validada. */
export interface AgreementSettings {
  /** Horas para firmar antes de que el turno se libere (COPAYNI-89, 48 por defecto). */
  readonly signatureTtlHours: number;
}

/** Evidencia inmutable de la firma: se escribe una vez y no se puede modificar ni borrar. */
export interface SignatureEvidence {
  readonly signedAt: Date;
  readonly ip: string | null;
  readonly userAgent: string | null;
  /** Hashes congelados: lo que se firmó, aunque la plantilla cambie después. */
  readonly contractHash: string;
  readonly promissoryNoteHash: string;
}

/** Datos para crear los acuerdos de una unión, ya renderizados por el caso de uso. */
export interface NewAgreement {
  readonly id: string;
  readonly userId: string;
  readonly circleId: string;
  readonly position: number;
  readonly contractVersion: string;
  readonly contractText: string;
  readonly contractHash: string;
  readonly promissoryNoteVersion: string;
  readonly promissoryNoteText: string;
  readonly promissoryNoteHash: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

/** Una membresía que venció sin firma: su turno se libera. */
export interface ExpiredMembership {
  readonly agreementId: string;
  readonly userId: string;
  readonly circleId: string;
  readonly position: number;
}

export interface AgreementRepositoryPort {
  create(agreement: NewAgreement): Promise<void>;
  byId(id: string): Promise<MembershipAgreement | null>;
  /** Los acuerdos del usuario, del más reciente al más antiguo. */
  listFor(userId: string): Promise<MembershipAgreement[]>;
  find(userId: string, circleId: string): Promise<MembershipAgreement | null>;
  /** Si le queda algún acuerdo sin firmar (`pending` o `expired`). */
  hasUnsigned(userId: string): Promise<boolean>;
  /** Marca leído el documento, si no lo estaba ya. */
  markRead(id: string, document: AgreementDocument, now: Date): Promise<void>;
  /**
   * Firma los dos documentos y guarda la evidencia en una transacción. Solo firma si el acuerdo
   * sigue `pending` y no venció: si otra solicitud ganó, responde `false` y no escribe nada.
   */
  sign(id: string, evidence: SignatureEvidence): Promise<boolean>;
  /**
   * Marca `expired` los acuerdos vencidos sin firmar y devuelve las membresías cuyo turno hay
   * que liberar. Idempotente: un acuerdo ya vencido no se devuelve dos veces.
   */
  expire(now: Date): Promise<ExpiredMembership[]>;
}

export interface SignatureChallengeRepositoryPort {
  create(challenge: SignatureChallenge): Promise<void>;
  /** El último desafío del acuerdo, o `null`. */
  latestFor(agreementId: string): Promise<SignatureChallenge | null>;
  /**
   * Bloquea el desafío, aplica `change` y guarda el resultado en una sola transacción: dos
   * intentos simultáneos no pueden descontar el mismo intento. Devuelve `null` si no existe.
   */
  update<T>(id: string, change: (challenge: SignatureChallenge) => T): Promise<T | null>;
}

/**
 * `agreements` no conoce a `circles`: liberar el turno de una membresía vencida lo hace el módulo
 * de círculos, dueño de `circle_memberships`, con lo que devuelve `expire`. La dependencia va en
 * un solo sentido (circles → agreements), como con `JOIN_ELIGIBILITY` y el KYC.
 */
