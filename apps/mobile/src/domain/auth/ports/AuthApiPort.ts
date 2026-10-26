import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import type { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import type { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import type { OtpCode } from '@/domain/auth/value-objects/OtpCode';

/** API de autenticación sin contraseña (contrato en docs/api/auth.md). */
export interface AuthApiPort {
  /** Envía un OTP al email o teléfono; crea el usuario si no existe sin revelarlo. */
  startAuthentication(identifier: LoginIdentifier, signal?: AbortSignal): Promise<AuthChallenge>;
  /** Canjea el código por la sesión. Un rechazo se lanza como OtpVerificationError. */
  verifyOtp(challengeId: string, code: OtpCode, signal?: AbortSignal): Promise<AuthTokens>;
  /** Invalida el código anterior y envía uno nuevo. */
  resendOtp(challengeId: string, signal?: AbortSignal): Promise<AuthChallenge>;
}
