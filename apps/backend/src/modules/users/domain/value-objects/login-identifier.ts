import { ValidationError } from '../../../../shared/errors/app-error';

export const LOGIN_IDENTIFIER_TYPES = ['email', 'phone'] as const;
export type LoginIdentifierType = (typeof LOGIN_IDENTIFIER_TYPES)[number];

/** Canal por el que se envía el OTP a cada tipo de identificador. */
export type OtpChannel = 'email' | 'sms';

// Mismo criterio que LoginIdentifier en mobile: forma razonable, no la RFC completa.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_MAX_LENGTH = 254;
/** E.164: `+`, código de país y hasta 15 dígitos en total. */
const PHONE = /^\+[1-9]\d{7,14}$/;

export class InvalidLoginIdentifierError extends ValidationError {
  constructor() {
    super('El email o teléfono no tiene un formato válido', { identifier: 'invalid' });
  }
}

/**
 * Email (normalizado en minúsculas) o teléfono E.164 con el que el usuario inicia sesión. El
 * backend vuelve a validar el formato aunque la app ya lo haga.
 */
export class LoginIdentifier {
  private constructor(
    readonly type: LoginIdentifierType,
    readonly value: string,
  ) {}

  static parse(value: string, type: LoginIdentifierType): LoginIdentifier {
    const trimmed = value.trim();
    if (type === 'email') {
      const email = trimmed.toLowerCase();
      if (email.length > EMAIL_MAX_LENGTH || !EMAIL.test(email)) {
        throw new InvalidLoginIdentifierError();
      }
      return new LoginIdentifier('email', email);
    }
    if (!PHONE.test(trimmed)) throw new InvalidLoginIdentifierError();
    return new LoginIdentifier('phone', trimmed);
  }

  get channel(): OtpChannel {
    return this.type === 'email' ? 'email' : 'sms';
  }

  /**
   * Destino enmascarado para mostrar en la app: `a***@mail.com` o `+51 ••• ••• 321`. Nunca se
   * devuelve ni se registra el identificador completo.
   */
  masked(): string {
    if (this.type === 'email') {
      const [local = '', domain = ''] = this.value.split('@');
      return `${local.slice(0, 1)}***@${domain}`;
    }
    return `${this.value.slice(0, 3)} ••• ••• ${this.value.slice(-3)}`;
  }
}
