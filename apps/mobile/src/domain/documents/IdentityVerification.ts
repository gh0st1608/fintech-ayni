import { DomainError } from '@/domain/shared/errors/DomainError';

/**
 * Verificación de identidad en línea con VerificaID (COPAYNI-92, backend COPAYNI-42): Consulta
 * del DNI en RENIEC y, si coincide, biometría facial y prueba de vida en la web del proveedor.
 */
export type IdentityVerificationStatus =
  'notStarted' | 'inProgress' | 'inReview' | 'approved' | 'rejected';

export const IDENTITY_REJECTION_REASONS = [
  'documentNotFound',
  'dataMismatch',
  'documentInUse',
  'biometricDeclined',
  'documentExpired',
  'sessionExpired',
  'abandoned',
  'providerError',
] as const;
export type IdentityRejectionReason = (typeof IDENTITY_REJECTION_REASONS)[number];

export interface IdentityVerification {
  status: IdentityVerificationStatus;
  /** Versión del consentimiento vigente: la app la envía al aceptarlo. */
  consentVersion: string;
  /** DNI enmascarado, p. ej. `•••••912`. */
  documentNumber: string | null;
  reason: IdentityRejectionReason | null;
  /** Solo mientras está en curso: el flujo de VerificaID. */
  verificationUrl: string | null;
  decidedAt: Date | null;
}

/** Retorno del flujo de VerificaID a la app (el `callback_url` que envía el backend). */
export const IDENTITY_RETURN_URL = 'ayni://identity-verification';

export class InvalidDniError extends DomainError {
  readonly code = 'INVALID_DNI';
}

export class ConsentRequiredError extends DomainError {
  readonly code = 'CONSENT_REQUIRED';
}

/** DNI peruano: 8 dígitos (admite espacios). */
export function normalizeDni(value: string): string {
  const dni = value.replace(/\s/g, '');
  if (!/^\d{8}$/.test(dni)) throw new InvalidDniError('DNI must have 8 digits');
  return dni;
}
