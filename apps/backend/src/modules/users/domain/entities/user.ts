import { LoginIdentifier, type OtpChannel } from '../value-objects/login-identifier';

export type UserStatus = 'pending_verification' | 'active';

/**
 * Usuario de Ayni. Se crea al iniciar sesión por primera vez, pendiente de verificación, y queda
 * activo al verificar el OTP.
 */
export class User {
  private constructor(
    readonly id: string,
    readonly email: string | null,
    readonly phone: string | null,
    private currentStatus: UserStatus,
    private language: string | null,
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
  }): User {
    return new User(props.id, props.email, props.phone, props.status, props.preferredLanguage);
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
