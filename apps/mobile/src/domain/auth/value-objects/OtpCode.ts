import { DomainError } from '@/domain/shared/errors/DomainError';

export class InvalidOtpCodeError extends DomainError {
  readonly code = 'INVALID_OTP_CODE';
}

export const OTP_LENGTH = 4;
const OTP_PATTERN = /^\d{4}$/;

/** Código de un solo uso de 4 dígitos. Nunca se registra en logs ni se persiste. */
export class OtpCode {
  private constructor(readonly value: string) {}

  static create(raw: string): OtpCode {
    const value = raw.trim();
    if (!OTP_PATTERN.test(value)) {
      throw new InvalidOtpCodeError(`OTP must have exactly ${OTP_LENGTH} digits`);
    }
    return new OtpCode(value);
  }
}
