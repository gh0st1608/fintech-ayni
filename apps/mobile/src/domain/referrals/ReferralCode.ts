import { DomainError } from '@/domain/shared/errors/DomainError';

export class InvalidReferralCodeError extends DomainError {
  readonly code = 'INVALID_REFERRAL_CODE';
}

/** El mismo alfabeto que el backend: 8 caracteres sin 0, O, 1, I ni L (docs/api/referrals.md). */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const FORMAT = new RegExp(`^[${ALPHABET}]{8}$`);

/** Normaliza como el backend (se ignoran mayúsculas y espacios) y valida el formato. */
export function parseReferralCode(raw: string): string {
  const code = raw.replace(/\s+/g, '').toUpperCase();
  if (!FORMAT.test(code)) throw new InvalidReferralCodeError('Invalid referral code format');
  return code;
}
