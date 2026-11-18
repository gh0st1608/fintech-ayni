import type { OtpChannel } from '@/domain/auth/AuthChallenge';
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
 * El teléfono llega en formato internacional: la pantalla completa el número local con el país
 * elegido (`toInternational`, pending-scope D14).
 */
export class LoginIdentifier {
  private constructor(
    readonly kind: LoginIdentifierKind,
    readonly value: string,
  ) {}

  /**
   * Devuelve `null` en vez de lanzar. Los formularios validan en cada pulsación, y lanzar y
   * capturar una excepción por cada render no es gratis: construir el error arma su traza.
   */
  static tryCreate(raw: string): LoginIdentifier | null {
    const input = raw.trim();
    if (input.includes('@')) {
      const email = input.toLowerCase();
      if (email.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(email)) return null;
      return new LoginIdentifier('email', email);
    }

    const phone = input.replace(PHONE_SEPARATORS, '');
    if (!E164_PATTERN.test(phone)) return null;
    return new LoginIdentifier('phone', phone);
  }

  static create(raw: string): LoginIdentifier {
    const identifier = LoginIdentifier.tryCreate(raw);
    if (identifier) return identifier;
    throw new InvalidLoginIdentifierError(
      raw.trim().includes('@')
        ? 'Invalid email address'
        : 'Phone must use the international format (E.164)',
    );
  }

  /** Canal por el que le llegaría el código: el teléfono recibe un SMS. */
  get channel(): OtpChannel {
    return this.kind === 'email' ? 'email' : 'sms';
  }

  /** Comprueba el formato sin lanzar: para validar en vivo en formularios. */
  static isValid(raw: string): boolean {
    return LoginIdentifier.tryCreate(raw) !== null;
  }
}
