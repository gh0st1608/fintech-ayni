import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import { OtpVerificationError } from '@/domain/auth/errors/OtpVerificationError';
import type { AuthApiPort } from '@/domain/auth/ports/AuthApiPort';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import type { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import type { OtpCode } from '@/domain/auth/value-objects/OtpCode';
import { AppError } from '@/domain/shared/errors/AppError';

/** Código que acepta el adaptador falso (documentado en .env.example). */
export const FAKE_OTP_CODE = '1234';

export interface InMemoryAuthApiOptions {
  /** Latencia simulada para ver los estados de carga. */
  latencyMs?: number;
  resendCooldownSeconds?: number;
  otpTtlSeconds?: number;
  maxAttempts?: number;
  now?: () => Date;
}

interface StoredChallenge {
  identifier: LoginIdentifier;
  attemptsLeft: number;
  expiresAt: number;
  resendAvailableAt: number;
}

const SECOND = 1000;

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AppError('cancelled', 'Request cancelled'));
    if (ms <= 0) return resolve();
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new AppError('cancelled', 'Request cancelled'));
    });
  });
}

/** Imita el enmascarado del backend: "j***@mail.com" o "+51 ••• ••• 789". */
export function maskDestination(identifier: LoginIdentifier): string {
  if (identifier.kind === 'email') {
    const [user = '', domain = ''] = identifier.value.split('@');
    return `${user.slice(0, 1)}***@${domain}`;
  }
  return `${identifier.value.slice(0, 3)} ••• ••• ${identifier.value.slice(-3)}`;
}

/**
 * Adaptador falso de la API de autenticación (contract-first): permite recorrer el flujo
 * sin backend con las mismas reglas que el contrato. Solo se compone en el ambiente dev.
 */
export class InMemoryAuthApi implements AuthApiPort {
  private sequence = 0;
  private readonly challenges = new Map<string, StoredChallenge>();
  private readonly latencyMs: number;
  private readonly resendCooldownSeconds: number;
  private readonly otpTtlSeconds: number;
  private readonly maxAttempts: number;
  private readonly now: () => Date;

  constructor(options: InMemoryAuthApiOptions = {}) {
    this.latencyMs = options.latencyMs ?? 600;
    this.resendCooldownSeconds = options.resendCooldownSeconds ?? 30;
    this.otpTtlSeconds = options.otpTtlSeconds ?? 300;
    this.maxAttempts = options.maxAttempts ?? 5;
    this.now = options.now ?? (() => new Date());
  }

  async startAuthentication(
    identifier: LoginIdentifier,
    signal?: AbortSignal,
  ): Promise<AuthChallenge> {
    await wait(this.latencyMs, signal);
    this.sequence += 1;
    return this.issue(`fake-challenge-${this.sequence}`, identifier);
  }

  async verifyOtp(challengeId: string, code: OtpCode, signal?: AbortSignal): Promise<AuthTokens> {
    await wait(this.latencyMs, signal);
    const challenge = this.challenges.get(challengeId);
    if (!challenge || challenge.expiresAt <= this.now().getTime()) {
      throw new OtpVerificationError('expired');
    }
    if (challenge.attemptsLeft <= 0) throw new OtpVerificationError('attempts_exceeded');
    if (code.value !== FAKE_OTP_CODE) {
      challenge.attemptsLeft -= 1;
      if (challenge.attemptsLeft <= 0) throw new OtpVerificationError('attempts_exceeded');
      throw new OtpVerificationError('invalid', challenge.attemptsLeft);
    }
    this.challenges.delete(challengeId);
    return AuthTokens.create({
      accessToken: `fake-access-${challengeId}`,
      refreshToken: `fake-refresh-${challengeId}`,
    });
  }

  async resendOtp(challengeId: string, signal?: AbortSignal): Promise<AuthChallenge> {
    await wait(this.latencyMs, signal);
    const challenge = this.challenges.get(challengeId);
    if (!challenge) throw new AppError('not_found', 'Unknown challenge', { status: 404 });
    if (challenge.resendAvailableAt > this.now().getTime()) {
      const seconds = Math.ceil((challenge.resendAvailableAt - this.now().getTime()) / SECOND);
      throw new AppError('rate_limited', 'Resend not allowed yet', {
        status: 429,
        retryAfterSeconds: seconds,
      });
    }
    return this.issue(challengeId, challenge.identifier);
  }

  private issue(challengeId: string, identifier: LoginIdentifier): AuthChallenge {
    const issuedAt = this.now().getTime();
    const challenge: StoredChallenge = {
      identifier,
      attemptsLeft: this.maxAttempts,
      expiresAt: issuedAt + this.otpTtlSeconds * SECOND,
      resendAvailableAt: issuedAt + this.resendCooldownSeconds * SECOND,
    };
    this.challenges.set(challengeId, challenge);
    return {
      challengeId,
      channel: identifier.kind === 'email' ? 'email' : 'sms',
      maskedDestination: maskDestination(identifier),
      expiresAt: new Date(challenge.expiresAt),
      resendAvailableAt: new Date(challenge.resendAvailableAt),
    };
  }
}
