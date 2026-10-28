import { DomainError, RateLimitedError } from '../../../../shared/errors/app-error';
import { type OtpChannel } from '../../../users/domain/value-objects/login-identifier';
import { type OtpPolicy } from '../value-objects/otp-policy';

export class OtpInvalidError extends DomainError {
  constructor(attemptsRemaining: number) {
    super('OTP_INVALID', 'El código es incorrecto', {
      attemptsRemaining: String(attemptsRemaining),
    });
  }
}

/** También cubre un desafío inexistente o ya usado: el cliente debe pedir otro código. */
export class OtpExpiredError extends DomainError {
  constructor() {
    super('OTP_EXPIRED', 'El código venció; pide uno nuevo');
  }
}

export class OtpAttemptsExceededError extends DomainError {
  constructor() {
    super('OTP_ATTEMPTS_EXCEEDED', 'Agotaste los intentos; pide un código nuevo');
  }
}

export type ChallengeStatus = 'pending' | 'locked' | 'verified';

export interface AuthChallengeState {
  readonly id: string;
  readonly userId: string;
  readonly channel: OtpChannel;
  readonly codeHash: string;
  readonly status: ChallengeStatus;
  readonly attemptsRemaining: number;
  readonly resendsRemaining: number;
  readonly expiresAt: Date;
  readonly resendAvailableAt: Date;
  /** Cuándo se emitió; cuenta para el límite de inicios por usuario. */
  readonly issuedAt: Date;
}

/** Resultado de un intento: el intento fallido se guarda aunque la verificación falle. */
export type VerificationOutcome =
  | { readonly kind: 'verified'; readonly userId: string }
  | { readonly kind: 'invalid'; readonly attemptsRemaining: number }
  | { readonly kind: 'attempts_exceeded' }
  | { readonly kind: 'expired' };

const addSeconds = (date: Date, seconds: number): Date => new Date(date.getTime() + seconds * 1000);
const secondsBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / 1000;

/**
 * Un código OTP enviado a un usuario. El código solo existe como hash; compararlo es tarea de la
 * aplicación (en tiempo constante), que informa aquí si coincidió.
 *
 * - Cada intento fallido descuenta uno; al llegar a cero el desafío queda bloqueado.
 * - Un código vencido, bloqueado o ya usado nunca verifica.
 * - Reenviar invalida el código anterior y reinicia intentos y plazos.
 */
export class AuthChallenge {
  private constructor(private state: AuthChallengeState) {}

  static issue(props: {
    id: string;
    userId: string;
    channel: OtpChannel;
    codeHash: string;
    now: Date;
    policy: OtpPolicy;
  }): AuthChallenge {
    const { now, policy } = props;
    return new AuthChallenge({
      id: props.id,
      userId: props.userId,
      channel: props.channel,
      codeHash: props.codeHash,
      status: 'pending',
      attemptsRemaining: policy.maxAttempts,
      resendsRemaining: policy.maxResends,
      expiresAt: addSeconds(now, policy.codeTtlSeconds),
      resendAvailableAt: addSeconds(now, policy.resendCooldownSeconds),
      issuedAt: now,
    });
  }

  static restore(state: AuthChallengeState): AuthChallenge {
    return new AuthChallenge({ ...state });
  }

  get snapshot(): AuthChallengeState {
    return { ...this.state };
  }

  get id(): string {
    return this.state.id;
  }

  get codeHash(): string {
    return this.state.codeHash;
  }

  /** Si todavía se puede intentar: comprobarlo antes de comparar el código. */
  check(now: Date): VerificationOutcome | null {
    if (this.state.status === 'locked') return { kind: 'attempts_exceeded' };
    if (this.state.status === 'verified' || now >= this.state.expiresAt) return { kind: 'expired' };
    return null;
  }

  /** Registra un intento con el resultado de la comparación del código. */
  attempt(codeMatches: boolean, now: Date): VerificationOutcome {
    const blocked = this.check(now);
    if (blocked) return blocked;
    if (codeMatches) {
      this.state = { ...this.state, status: 'verified' };
      return { kind: 'verified', userId: this.state.userId };
    }
    const attemptsRemaining = this.state.attemptsRemaining - 1;
    this.state = {
      ...this.state,
      attemptsRemaining,
      status: attemptsRemaining === 0 ? 'locked' : 'pending',
    };
    return attemptsRemaining === 0
      ? { kind: 'attempts_exceeded' }
      : { kind: 'invalid', attemptsRemaining };
  }

  /**
   * Reemplaza el código. Antes de `resendAvailableAt`, o sin reenvíos disponibles, responde
   * RATE_LIMITED con los segundos a esperar.
   */
  resend(props: { codeHash: string; now: Date; policy: OtpPolicy }): void {
    const { codeHash, now, policy } = props;
    if (this.state.status === 'verified') throw new OtpExpiredError();
    if (now < this.state.resendAvailableAt) {
      throw new RateLimitedError(secondsBetween(now, this.state.resendAvailableAt));
    }
    if (this.state.resendsRemaining === 0) {
      // Sin reenvíos: hay que esperar a que venza y empezar de nuevo.
      throw new RateLimitedError(Math.max(1, secondsBetween(now, this.state.expiresAt)));
    }
    this.state = {
      ...this.state,
      codeHash,
      status: 'pending',
      attemptsRemaining: policy.maxAttempts,
      resendsRemaining: this.state.resendsRemaining - 1,
      expiresAt: addSeconds(now, policy.codeTtlSeconds),
      resendAvailableAt: addSeconds(now, policy.resendCooldownSeconds),
    };
  }
}

/** Traduce un resultado que no es éxito al error del contrato. */
export function verificationError(
  outcome: Exclude<VerificationOutcome, { kind: 'verified' }>,
): DomainError {
  switch (outcome.kind) {
    case 'invalid':
      return new OtpInvalidError(outcome.attemptsRemaining);
    case 'attempts_exceeded':
      return new OtpAttemptsExceededError();
    case 'expired':
      return new OtpExpiredError();
  }
}
