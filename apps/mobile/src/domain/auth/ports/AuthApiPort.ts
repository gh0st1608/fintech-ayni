import type { AuthChallenge, OtpChannel } from '@/domain/auth/AuthChallenge';
import type { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import type { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import type { OtpCode } from '@/domain/auth/value-objects/OtpCode';

/** API de autenticación sin contraseña (contrato en docs/api/auth.md). */
export interface AuthApiPort {
  /**
   * Por dónde puede llegar el código en este ambiente. Lo decide el backend: mientras un canal no
   * tenga proveedor, pedir un código por ahí responde 503.
   */
  availableChannels(signal?: AbortSignal): Promise<OtpChannel[]>;
  /** Envía un OTP al email o teléfono; crea el usuario si no existe sin revelarlo. */
  startAuthentication(identifier: LoginIdentifier, signal?: AbortSignal): Promise<AuthChallenge>;
  /** Canjea el código por la sesión. Un rechazo se lanza como OtpVerificationError. */
  verifyOtp(challengeId: string, code: OtpCode, signal?: AbortSignal): Promise<AuthTokens>;
  /** Invalida el código anterior y envía uno nuevo. */
  resendOtp(challengeId: string, signal?: AbortSignal): Promise<AuthChallenge>;
  /** Rota el par de tokens. Un refresh token vencido o revocado se rechaza con AppError unauthorized. */
  refreshSession(refreshToken: string): Promise<AuthTokens>;
  /** Revoca el refresh token en el backend. */
  logout(refreshToken: string): Promise<void>;
}
