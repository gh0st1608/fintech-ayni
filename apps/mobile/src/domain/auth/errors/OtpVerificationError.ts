import { DomainError } from '@/domain/shared/errors/DomainError';

export type OtpRejectionReason = 'invalid' | 'expired' | 'attempts_exceeded';

/** El backend rechazó el código: incorrecto, vencido o con los intentos agotados. */
export class OtpVerificationError extends DomainError {
  readonly code = 'OTP_REJECTED';

  constructor(
    readonly reason: OtpRejectionReason,
    readonly attemptsRemaining?: number,
  ) {
    super(`OTP rejected: ${reason}`);
  }

  /** Un código vencido o bloqueado solo se recupera pidiendo uno nuevo. */
  get requiresResend(): boolean {
    return this.reason !== 'invalid';
  }
}
