import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import type { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import type { OtpCode } from '@/domain/auth/value-objects/OtpCode';

import type { UserProfile } from '../UserProfile';

/** Perfil del usuario en el backend (docs/api/me.md). */
export interface UserProfileRepositoryPort {
  getProfile(signal?: AbortSignal): Promise<UserProfile>;
  /** Idioma de las notificaciones y los emails del backend. */
  updatePreferredLanguage(languageCode: string): Promise<void>;
  updatePersonalInfo(info: { firstName: string; lastName: string }): Promise<UserProfile>;
  /** Envía un OTP al email o teléfono nuevo; el dato no cambia todavía (R9). */
  startContactChange(identifier: LoginIdentifier): Promise<AuthChallenge>;
  /**
   * Aplica el cambio con el código. Rechaza con OtpVerificationError o con el código
   * CONTACT_TAKEN si otra cuenta ya lo usa.
   */
  verifyContactChange(challengeId: string, code: OtpCode): Promise<UserProfile>;
}
