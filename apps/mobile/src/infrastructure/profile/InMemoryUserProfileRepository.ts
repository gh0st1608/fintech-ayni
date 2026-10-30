import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';
import type { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import type { OtpCode } from '@/domain/auth/value-objects/OtpCode';
import type { UserProfileRepositoryPort } from '@/domain/profile/ports/UserProfileRepositoryPort';
import type { UserProfile } from '@/domain/profile/UserProfile';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryUserProfileOptions {
  latencyMs?: number;
  profile?: Partial<UserProfile>;
  /** Moneda del límite mensual falso de 5.000; sin ella, sin límite. */
  currency?: string;
}

/** Código que acepta el perfil falso, como el OTP de la API de autenticación falsa. */
const FAKE_OTP = '1234';
/** Dato que el perfil falso simula registrado en otra cuenta. */
const TAKEN = 'usado@mail.com';

const fullNameOf = (firstName: string | null, lastName: string | null) =>
  [firstName, lastName].filter(Boolean).join(' ') || null;

/** Perfil falso (solo dev y pruebas), con las reglas de docs/api/me.md. */
export class InMemoryUserProfileRepository implements UserProfileRepositoryPort {
  preferredLanguage: string | null = null;
  profile: UserProfile;
  private readonly latencyMs: number;
  private readonly challenges = new Map<string, LoginIdentifier>();

  constructor(options: InMemoryUserProfileOptions = {}) {
    this.latencyMs = options.latencyMs ?? 300;
    this.profile = {
      id: 'u-1',
      email: 'ana@mail.com',
      phone: null,
      firstName: null,
      lastName: null,
      fullName: null,
      preferredLanguage: null,
      monthlyPayInLimit: options.currency ? Money.fromMajor(5_000, options.currency) : null,
      ...options.profile,
    };
  }

  async getProfile(signal?: AbortSignal): Promise<UserProfile> {
    await simulateLatency(this.latencyMs, signal);
    return { ...this.profile };
  }

  async updatePreferredLanguage(languageCode: string): Promise<void> {
    await simulateLatency(this.latencyMs);
    this.preferredLanguage = languageCode;
  }

  async updatePersonalInfo(info: { firstName: string; lastName: string }): Promise<UserProfile> {
    await simulateLatency(this.latencyMs);
    this.profile = {
      ...this.profile,
      ...info,
      fullName: fullNameOf(info.firstName, info.lastName),
    };
    return { ...this.profile };
  }

  async startContactChange(identifier: LoginIdentifier): Promise<AuthChallenge> {
    await simulateLatency(this.latencyMs);
    const current = identifier.kind === 'email' ? this.profile.email : this.profile.phone;
    if (current === identifier.value) {
      throw new AppError('validation', 'Same contact', { code: 'VALIDATION_ERROR' });
    }
    const challengeId = `contact-${this.challenges.size + 1}`;
    this.challenges.set(challengeId, identifier);
    const now = Date.now();
    return {
      challengeId,
      channel: identifier.kind === 'email' ? 'email' : 'sms',
      maskedDestination: `${identifier.value.slice(0, 2)}***${identifier.value.slice(-2)}`,
      expiresAt: new Date(now + 300_000),
      resendAvailableAt: new Date(now + 30_000),
    };
  }

  async verifyContactChange(challengeId: string, code: OtpCode): Promise<UserProfile> {
    await simulateLatency(this.latencyMs);
    const identifier = this.challenges.get(challengeId);
    if (!identifier) throw new OtpVerificationError('expired');
    if (code.value !== FAKE_OTP) throw new OtpVerificationError('invalid', 4);
    this.challenges.delete(challengeId);
    if (identifier.value === TAKEN) {
      throw new AppError('conflict', 'Contact taken', { code: 'CONTACT_TAKEN' });
    }
    this.profile = { ...this.profile, [identifier.kind]: identifier.value };
    return { ...this.profile };
  }
}
