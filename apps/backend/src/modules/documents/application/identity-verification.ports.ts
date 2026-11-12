import {
  type BiometricStatus,
  type DocumentCheck,
  type IdentityDecision,
  type IdentityRejectionReason,
  type IdentityVerificationStatus,
} from '../domain/identity-verification';

export const IDENTITY_PROVIDER = Symbol('IDENTITY_PROVIDER');
export const IDENTITY_VERIFICATIONS = Symbol('IDENTITY_VERIFICATIONS');
export const IDENTITY_SETTINGS = Symbol('IDENTITY_SETTINGS');

export interface BiometricSession {
  sessionId: string;
  /** Enlace del flujo del proveedor (captura del DNI, selfie y prueba de vida). */
  url: string;
  status: BiometricStatus;
}

/**
 * Proveedor de verificación de identidad (COPAYNI-42: VerificaID). Las llamadas que fallan por
 * red, cuota o un error del proveedor lanzan InfrastructureError (503 para la app).
 */
export interface IdentityProviderPort {
  /** Validación documental ("Consulta"): el DNI existe y los nombres coinciden. */
  checkDocument(props: {
    documentNumber: string;
    firstName: string;
    lastName: string;
  }): Promise<DocumentCheck>;
  /** Abre la sesión biométrica ("CheckMatch"): DNI, selfie, comparación facial y prueba de vida. */
  startBiometricSession(props: {
    /** Referencia de Ayni (el id de la verificación), sin datos personales. */
    reference: string;
    email: string;
    /** Adónde vuelve la persona al terminar (deep link de la app). */
    callbackUrl: string;
  }): Promise<BiometricSession>;
  /**
   * Estado de la sesión, consultado al proveedor con credenciales: es la única fuente de verdad
   * (el webhook solo avisa). `null` si el proveedor todavía no la asocia a ese DNI (no se abrió)
   * o si la última sesión del DNI es otra.
   */
  biometricStatus(props: {
    sessionId: string;
    documentNumber: string;
  }): Promise<BiometricStatus | null>;
}

export interface IdentitySettings {
  /** Versión vigente del consentimiento del tratamiento de datos biométricos (L3). */
  consentVersion: string;
  callbackUrl: string;
  /** Rechazos atribuibles a la persona antes de pasar a revisión manual. */
  maxRejectedAttempts: number;
  /** Horas tras las que una sesión sin resultado se da por vencida. */
  sessionTtlHours: number;
}

export interface IdentityVerification {
  id: string;
  userId: string;
  documentNumber: string;
  status: IdentityVerificationStatus;
  reason: IdentityRejectionReason | null;
  documentCheck: DocumentCheck;
  providerSessionId: string | null;
  verificationUrl: string | null;
  createdAt: Date;
  decidedAt: Date | null;
}

/** Lo que la verificación necesita del perfil. */
export interface IdentitySubject {
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface NewIdentityVerification {
  id: string;
  userId: string;
  documentNumber: string;
  decision: IdentityDecision;
  documentCheck: DocumentCheck;
  providerSessionId: string | null;
  verificationUrl: string | null;
  consentVersion: string;
}

export interface IdentityVerificationRepositoryPort {
  subject(userId: string): Promise<IdentitySubject | null>;
  /** La verificación más reciente de la persona. */
  latest(userId: string): Promise<IdentityVerification | null>;
  /** Rechazos que cuentan como intento (COUNTED_REJECTIONS). */
  countedRejections(userId: string): Promise<number>;
  /** El DNI ya está aprobado en otra cuenta. */
  verifiedByOther(userId: string, documentNumber: string): Promise<boolean>;
  create(verification: NewIdentityVerification): Promise<IdentityVerification>;
  findBySession(providerSessionId: string): Promise<IdentityVerification | null>;
  /**
   * Aplica la decisión solo si la verificación sigue abierta. Si al aprobar el DNI ya quedó
   * aprobado en otra cuenta, la rechaza con `document_in_use`. Devuelve el estado final.
   */
  decide(id: string, decision: IdentityDecision): Promise<IdentityVerification>;
}
