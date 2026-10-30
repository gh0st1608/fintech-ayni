import { ValidationError } from '../../../../shared/errors/app-error';
import { LoginIdentifier, type OtpChannel } from '../value-objects/login-identifier';

/** Nombre o apellido: 1 a 80 caracteres, sin espacios al inicio ni al final. */
export class InvalidPersonNameError extends ValidationError {
  constructor(field: 'firstName' | 'lastName') {
    super('El nombre no es válido', { [field]: 'invalid' });
  }
}

const personName = (value: string, field: 'firstName' | 'lastName'): string => {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  if (trimmed.length < 1 || trimmed.length > 80 || /[\p{C}<>]/u.test(trimmed)) {
    throw new InvalidPersonNameError(field);
  }
  return trimmed;
};

export type UserStatus = 'pending_verification' | 'active';

/**
 * Usuario de Ayni. Se crea al iniciar sesión por primera vez, pendiente de verificación, y queda
 * activo al verificar el OTP.
 */
export class User {
  private constructor(
    readonly id: string,
    private currentEmail: string | null,
    private currentPhone: string | null,
    private currentStatus: UserStatus,
    private language: string | null,
    private first: string | null = null,
    private last: string | null = null,
  ) {}

  static register(id: string, identifier: LoginIdentifier): User {
    return new User(
      id,
      identifier.type === 'email' ? identifier.value : null,
      identifier.type === 'phone' ? identifier.value : null,
      'pending_verification',
      null,
    );
  }

  static restore(props: {
    id: string;
    email: string | null;
    phone: string | null;
    status: UserStatus;
    preferredLanguage: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }): User {
    return new User(
      props.id,
      props.email,
      props.phone,
      props.status,
      props.preferredLanguage,
      props.firstName ?? null,
      props.lastName ?? null,
    );
  }

  get email(): string | null {
    return this.currentEmail;
  }

  get phone(): string | null {
    return this.currentPhone;
  }

  get firstName(): string | null {
    return this.first;
  }

  get lastName(): string | null {
    return this.last;
  }

  /** Nombre y apellido, o `null` si no cargó ninguno. */
  get fullName(): string | null {
    const full = [this.first, this.last].filter(Boolean).join(' ');
    return full || null;
  }

  /** Información personal (COPAYNI-45). Un campo ausente no cambia. */
  changeName(changes: { firstName?: string; lastName?: string }): void {
    if (changes.firstName !== undefined) this.first = personName(changes.firstName, 'firstName');
    if (changes.lastName !== undefined) this.last = personName(changes.lastName, 'lastName');
  }

  /** Aplica un email o teléfono ya verificado por OTP (COPAYNI-45, R9). */
  changeContact(identifier: LoginIdentifier): void {
    if (identifier.type === 'email') this.currentEmail = identifier.value;
    else this.currentPhone = identifier.value;
  }

  get status(): UserStatus {
    return this.currentStatus;
  }

  get preferredLanguage(): string | null {
    return this.language;
  }

  /** Identificador al que se envía el OTP por ese canal, o `null` si el usuario no lo tiene. */
  loginIdentifier(channel: OtpChannel): LoginIdentifier | null {
    if (channel === 'email') return this.email ? LoginIdentifier.parse(this.email, 'email') : null;
    return this.phone ? LoginIdentifier.parse(this.phone, 'phone') : null;
  }

  /** Verificó que el email o teléfono le pertenece. Idempotente. */
  activate(): void {
    this.currentStatus = 'active';
  }

  changePreferredLanguage(code: string): void {
    this.language = code;
  }
}
