import { DomainError } from '@/domain/shared/errors/DomainError';

export class InvalidLoginIdentifierError extends DomainError {
  readonly code = 'INVALID_LOGIN_IDENTIFIER';
}

export type LoginIdentifierKind = 'email' | 'phone';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** E.164: "+" y de 8 a 15 dígitos, sin cero inicial en el código de país. */
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const PHONE_SEPARATORS = /[\s().-]/g;
const MAX_EMAIL_LENGTH = 254;

/**
 * Email o teléfono con el que el usuario se identifica para recibir el OTP.
 * El teléfono se exige en formato internacional hasta que exista selector de país (pending-scope D14).
 */
export class LoginIdentifier {
  private constructor(
    readonly kind: LoginIdentifierKind,
    readonly value: string,
  ) {}

  static create(raw: string): LoginIdentifier {
    const input = raw.trim();
    if (input.includes('@')) {
      const email = input.toLowerCase();
      if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) {
        throw new InvalidLoginIdentifierError('Invalid email address');
      }
      return new LoginIdentifier('email', email);
    }

    const phone = input.replace(PHONE_SEPARATORS, '');
    if (!E164_PATTERN.test(phone)) {
      throw new InvalidLoginIdentifierError('Phone must use the international format (E.164)');
    }
    return new LoginIdentifier('phone', phone);
  }

  /** Comprueba el formato sin lanzar: para validar en vivo en formularios. */
  static isValid(raw: string): boolean {
    try {
      LoginIdentifier.create(raw);
      return true;
    } catch {
      return false;
    }
  }
}
