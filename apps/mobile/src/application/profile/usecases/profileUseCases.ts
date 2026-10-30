import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import { OtpCode } from '@/domain/auth/value-objects/OtpCode';
import type { UserProfileRepositoryPort } from '@/domain/profile/ports/UserProfileRepositoryPort';
import { isValidPersonName, type UserProfile } from '@/domain/profile/UserProfile';
import { DomainError } from '@/domain/shared/errors/DomainError';

export class InvalidPersonNameError extends DomainError {
  readonly code = 'INVALID_PERSON_NAME';

  constructor(readonly fields: ('firstName' | 'lastName')[]) {
    super('Invalid person name');
  }
}

/** Mi perfil con el límite mensual de pay-in (COPAYNI-44). */
export class GetMyProfileUseCase {
  constructor(private readonly profiles: UserProfileRepositoryPort) {}

  execute(signal?: AbortSignal): Promise<UserProfile> {
    return this.profiles.getProfile(signal);
  }
}

/** Edita nombre y apellido (COPAYNI-45) con las mismas reglas que el backend. */
export class UpdatePersonalInfoUseCase {
  constructor(private readonly profiles: UserProfileRepositoryPort) {}

  execute(info: { firstName: string; lastName: string }): Promise<UserProfile> {
    const invalid = (['firstName', 'lastName'] as const).filter(
      (field) => !isValidPersonName(info[field]),
    );
    if (invalid.length > 0) return Promise.reject(new InvalidPersonNameError(invalid));
    return this.profiles.updatePersonalInfo({
      firstName: info.firstName.trim(),
      lastName: info.lastName.trim(),
    });
  }
}

/** Cambiar el email o el teléfono, paso 1: OTP al dato nuevo (R9). */
export class StartContactChangeUseCase {
  constructor(private readonly profiles: UserProfileRepositoryPort) {}

  /** Rechaza con InvalidLoginIdentifierError si el formato no es válido. */
  async execute(raw: string): Promise<AuthChallenge> {
    return this.profiles.startContactChange(LoginIdentifier.create(raw));
  }
}

/** Paso 2: el código aplica el cambio. */
export class VerifyContactChangeUseCase {
  constructor(private readonly profiles: UserProfileRepositoryPort) {}

  async execute(challengeId: string, code: string): Promise<UserProfile> {
    return this.profiles.verifyContactChange(challengeId, OtpCode.create(code));
  }
}
