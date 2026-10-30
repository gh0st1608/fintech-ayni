import { type OtpChannel } from '../../../users/domain/value-objects/login-identifier';
import { type AuthChallenge } from '../../domain/entities/auth-challenge';
import { type OtpPolicy } from '../../domain/value-objects/otp-policy';

export const AUTH_CHALLENGE_REPOSITORY = Symbol('AUTH_CHALLENGE_REPOSITORY');
export const REFRESH_TOKEN_REPOSITORY = Symbol('REFRESH_TOKEN_REPOSITORY');
export const OTP_GENERATOR = Symbol('OTP_GENERATOR');
export const OTP_HASHER = Symbol('OTP_HASHER');
export const OTP_SENDER = Symbol('OTP_SENDER');
export const ACCESS_TOKEN_ISSUER = Symbol('ACCESS_TOKEN_ISSUER');
export const REFRESH_TOKEN_SECRETS = Symbol('REFRESH_TOKEN_SECRETS');
export const AUTH_POLICY = Symbol('AUTH_POLICY');

/** Parámetros de la autenticación, desde la configuración validada (pending-scope R10). */
export interface AuthPolicy {
  readonly otp: OtpPolicy;
  /** Desafíos por usuario dentro de la ventana antes de responder RATE_LIMITED. */
  readonly startMaxPerWindow: number;
  readonly startWindowSeconds: number;
  readonly refreshTokenTtlDays: number;
}

export interface AuthChallengeRepositoryPort {
  create(challenge: AuthChallenge): Promise<void>;
  /**
   * Bloquea el desafío, aplica `change` y guarda el resultado en una sola transacción: dos
   * intentos simultáneos no pueden descontar el mismo intento. Si `change` lanza, no se guarda
   * nada. Devuelve `null` si el desafío no existe.
   */
  update<T>(id: string, change: (challenge: AuthChallenge) => T): Promise<T | null>;
  /** Cuántos desafíos se emitieron al usuario después de `since`, y el más antiguo de ellos. */
  issuedSince(userId: string, since: Date): Promise<{ count: number; oldest: Date | null }>;
}

export const CONTACT_CHANGES = Symbol('CONTACT_CHANGES');

/** Cambio de email o teléfono pendiente de verificar por OTP (COPAYNI-45, supuesto R9). */
export interface ContactChange {
  userId: string;
  type: 'email' | 'phone';
  value: string;
  appliedAt: Date | null;
}

export interface ContactChangeRepositoryPort {
  create(challengeId: string, change: Omit<ContactChange, 'appliedAt'>): Promise<void>;
  find(challengeId: string): Promise<ContactChange | null>;
  markApplied(challengeId: string): Promise<void>;
}

export type RefreshTokenUse =
  | { readonly status: 'valid'; readonly familyId: string; readonly userId: string }
  /** Ya se había usado: posible robo. La familia entera debe revocarse. */
  | { readonly status: 'reused'; readonly familyId: string }
  | { readonly status: 'invalid' };

export interface RefreshTokenRepositoryPort {
  create(token: {
    familyId: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  /** Marca el token como usado de forma atómica: solo una solicitud puede usarlo. */
  consume(tokenHash: string, now: Date): Promise<RefreshTokenUse>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
  /** Revoca la sesión (familia) del token, si existe. Idempotente. */
  revokeFamilyOf(tokenHash: string, now: Date): Promise<void>;
}

export interface OtpGeneratorPort {
  /** Código de 4 dígitos. */
  generate(): string;
}

/** Hash del código atado al desafío; `matches` compara en tiempo constante. */
export interface OtpHasherPort {
  hash(challengeId: string, code: string): string;
  matches(challengeId: string, code: string, codeHash: string): boolean;
}

export interface OtpSenderPort {
  send(message: { channel: OtpChannel; destination: string; code: string }): Promise<void>;
}

export interface AccessTokenIssuerPort {
  issue(userId: string): string;
}

/** Refresh tokens opacos de alta entropía; en la base solo se guarda su hash. */
export interface RefreshTokenSecretsPort {
  generate(): { token: string; tokenHash: string };
  hashOf(token: string): string;
}
