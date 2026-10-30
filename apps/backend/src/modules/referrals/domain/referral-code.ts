import { randomInt } from 'node:crypto';

import { ValidationError } from '../../../shared/errors/app-error';

/** Sin 0, O, 1, I ni L: se dictan y se copian sin confusión. */
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const LENGTH = 8;
const FORMAT = new RegExp(`^[${ALPHABET}]{${LENGTH}}$`);

export class InvalidReferralCodeError extends ValidationError {
  constructor() {
    super('El código de invitación no es válido', { code: 'invalid' });
  }
}

/** Código de invitación del usuario (COPAYNI-51): 8 caracteres sin ambigüedades, en mayúsculas. */
export const ReferralCode = {
  generate(): string {
    return Array.from({ length: LENGTH }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  },
  /** Normaliza lo que escribió o pegó el usuario; rechaza un formato inválido. */
  parse(value: string): string {
    const code = value.trim().toUpperCase();
    if (!FORMAT.test(code)) throw new InvalidReferralCodeError();
    return code;
  },
};
