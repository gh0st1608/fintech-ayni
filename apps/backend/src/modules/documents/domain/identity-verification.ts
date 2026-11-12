import { containsAllTokens, nameTokens } from '../../../shared/domain/person-name';
import { ConflictError, DomainError, ValidationError } from '../../../shared/errors/app-error';

/**
 * Verificación de identidad con VerificaID (COPAYNI-42, decidido por negocio el 2026-11-11):
 * 1. Validación documental (servicio "Consulta"): el DNI existe en RENIEC y sus nombres y
 *    apellidos coinciden con los del perfil.
 * 2. Biometría facial y prueba de vida (servicio "CheckMatch"): la persona captura su DNI y una
 *    selfie en el flujo del proveedor; se compara su rostro con la imagen de referencia y se
 *    comprueba que está presente (no una foto, un video ni una pantalla).
 *
 * Solo se abre la sesión biométrica si la validación documental pasó: así no se paga un
 * CheckMatch por un DNI que no existe o no es del titular.
 */
export const IDENTITY_VERIFICATION_STATUSES = [
  'in_progress',
  'in_review',
  'approved',
  'rejected',
] as const;
export type IdentityVerificationStatus = (typeof IDENTITY_VERIFICATION_STATUSES)[number];

/** Una verificación abierta todavía puede cambiar de estado; las demás ya están resueltas. */
export const OPEN_STATUSES = [
  'in_progress',
  'in_review',
] as const satisfies readonly IdentityVerificationStatus[];
export const isOpen = (status: IdentityVerificationStatus): boolean =>
  (OPEN_STATUSES as readonly string[]).includes(status);

/** Resultado de la validación documental (Consulta). */
export const DOCUMENT_CHECKS = ['matched', 'mismatch', 'not_found'] as const;
export type DocumentCheck = (typeof DOCUMENT_CHECKS)[number];

/** Estado de la sesión biométrica (CheckMatch), independiente del proveedor. */
export type BiometricStatus =
  | 'open'
  | 'in_review'
  | 'approved'
  | 'declined'
  | 'expired'
  | 'document_expired'
  | 'abandoned'
  | 'error';

/**
 * Motivos de rechazo: la app muestra el texto y ofrece reintentar. Provisional hasta que UX y
 * Legal revisen los textos.
 */
export const IDENTITY_REJECTION_REASONS = {
  document_not_found: 'No encontramos ese DNI en RENIEC: revisa el número',
  data_mismatch: 'Los nombres del DNI no coinciden con los de tu perfil',
  document_in_use: 'Ese DNI ya está verificado en otra cuenta',
  biometric_declined: 'No pudimos validar tu rostro con tu DNI: vuelve a intentarlo con buena luz',
  document_expired: 'Tu DNI está vencido: renuévalo y vuelve a intentarlo',
  session_expired: 'La verificación venció antes de terminar: vuelve a empezar',
  abandoned: 'No terminaste la verificación: vuelve a empezar',
  provider_error: 'Hubo un problema con la verificación: vuelve a intentarlo',
} as const;
export type IdentityRejectionReason = keyof typeof IDENTITY_REJECTION_REASONS;
export const IDENTITY_REJECTION_REASON_CODES = Object.keys(
  IDENTITY_REJECTION_REASONS,
) as IdentityRejectionReason[];

/**
 * Rechazos que cuentan como intento fallido. Vencer, abandonar o un fallo del proveedor no son
 * culpa de la persona: no cuentan.
 */
export const COUNTED_REJECTIONS = [
  'document_not_found',
  'data_mismatch',
  'document_in_use',
  'biometric_declined',
] as const satisfies readonly IdentityRejectionReason[];

export interface IdentityDecision {
  status: IdentityVerificationStatus;
  reason: IdentityRejectionReason | null;
}

/** Cómo queda la verificación según el estado de la sesión biométrica. */
export function decisionOf(status: BiometricStatus): IdentityDecision {
  switch (status) {
    case 'open':
      return { status: 'in_progress', reason: null };
    case 'in_review':
      return { status: 'in_review', reason: null };
    case 'approved':
      return { status: 'approved', reason: null };
    case 'declined':
      return { status: 'rejected', reason: 'biometric_declined' };
    case 'expired':
      return { status: 'rejected', reason: 'session_expired' };
    case 'document_expired':
      return { status: 'rejected', reason: 'document_expired' };
    case 'abandoned':
      return { status: 'rejected', reason: 'abandoned' };
    case 'error':
      return { status: 'rejected', reason: 'provider_error' };
  }
}

/** Rechazo por la validación documental. */
export const documentCheckRejection = (
  check: Exclude<DocumentCheck, 'matched'>,
): IdentityRejectionReason => (check === 'not_found' ? 'document_not_found' : 'data_mismatch');

/** DNI peruano: 8 dígitos. El carné de extranjería queda fuera de este alcance. */
export const isValidDni = (value: string): boolean => /^\d{8}$/.test(value);

/** El DNI nunca sale completo de la API: solo los 3 últimos dígitos. */
export const maskDocument = (value: string): string =>
  `${'•'.repeat(Math.max(0, value.length - 3))}${value.slice(-3)}`;

export { nameTokens };

const containsAll = containsAllTokens;

/** Los datos del DNI según RENIEC. */
export interface PersonRecord {
  names: string;
  fathersLastName: string;
  mothersLastName: string;
}

/**
 * Los nombres del perfil coinciden con los del DNI (regla provisional, a validar con
 * Cumplimiento):
 * - Cada palabra del nombre del perfil está entre los nombres del DNI ("Juana" vale para
 *   "JUANA MARIA").
 * - Cada palabra del apellido del perfil está entre los apellidos del DNI, y el apellido paterno
 *   está completo ("Torres" o "Torres Ramírez" valen; "Ramírez" solo, no).
 * Tildes, mayúsculas y guiones no importan.
 */
export function namesMatch(
  profile: { firstName: string; lastName: string },
  record: PersonRecord,
): boolean {
  const lastNames = [...nameTokens(record.fathersLastName), ...nameTokens(record.mothersLastName)];
  const profileLastName = nameTokens(profile.lastName);
  return (
    containsAll(nameTokens(record.names), nameTokens(profile.firstName)) &&
    containsAll(lastNames, profileLastName) &&
    containsAll(profileLastName, nameTokens(record.fathersLastName))
  );
}

export class IdentityAlreadyVerifiedError extends ConflictError {
  constructor() {
    super('IDENTITY_ALREADY_VERIFIED', 'Tu identidad ya está verificada');
  }
}

/** El proveedor está revisando la verificación a mano: hay que esperar su resultado. */
export class IdentityVerificationInReviewError extends ConflictError {
  constructor() {
    super('IDENTITY_VERIFICATION_IN_REVIEW', 'Tu verificación está en revisión');
  }
}

/** Demasiados intentos fallidos: el caso pasa a la revisión manual de operaciones. */
export class IdentityAttemptsExceededError extends ConflictError {
  constructor(maxAttempts: number) {
    super(
      'IDENTITY_ATTEMPTS_EXCEEDED',
      'Superaste los intentos de verificación: sube tu DNI para revisarlo a mano',
      { maxAttempts: String(maxAttempts) },
    );
  }
}

/** Faltan datos del perfil que la verificación necesita (nombres para comparar, email). */
export class IdentityProfileIncompleteError extends DomainError {
  constructor(missing: ('firstName' | 'lastName' | 'email')[]) {
    super(
      'IDENTITY_PROFILE_INCOMPLETE',
      'Completa tu nombre, apellido y email antes de verificar tu identidad',
      Object.fromEntries(missing.map((field) => [field, 'required'])),
    );
  }
}

/** La persona aceptó otra versión del consentimiento del tratamiento biométrico. */
export class IdentityConsentOutdatedError extends ValidationError {
  constructor() {
    super('Acepta la versión vigente del consentimiento', { consentVersion: 'outdated' });
  }
}

/** Sin proveedor biométrico (`KYC_PROVIDER=manual`): queda la subida del DNI para revisión. */
export class IdentityVerificationUnavailableError extends DomainError {
  constructor() {
    super(
      'IDENTITY_VERIFICATION_UNAVAILABLE',
      'La verificación en línea no está disponible: sube tu DNI para revisarlo',
    );
  }
}
