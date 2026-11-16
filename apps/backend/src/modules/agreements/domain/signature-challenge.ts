import { RateLimitedError } from '../../../shared/errors/app-error';
import { type OtpPolicy } from '../../auth/domain/value-objects/otp-policy';

/**
 * Resultado de un intento de firma. El intento fallido se guarda aunque la verificación falle,
 * igual que en el OTP del login.
 */
export type SignatureOutcome =
  | { readonly kind: 'verified'; readonly agreementId: string }
  | { readonly kind: 'invalid'; readonly attemptsRemaining: number }
  | { readonly kind: 'attempts_exceeded' }
  | { readonly kind: 'expired' };

export type SignatureChallengeStatus = 'pending' | 'locked' | 'consumed';

export interface SignatureChallengeState {
  readonly id: string;
  readonly agreementId: string;
  readonly codeHash: string;
  readonly status: SignatureChallengeStatus;
  readonly attemptsRemaining: number;
  readonly resendsRemaining: number;
  readonly expiresAt: Date;
  readonly resendAvailableAt: Date;
  readonly createdAt: Date;
}

const addSeconds = (date: Date, seconds: number): Date => new Date(date.getTime() + seconds * 1000);
const secondsBetween = (from: Date, to: Date): number => (to.getTime() - from.getTime()) / 1000;

/**
 * El código que firma los dos documentos de una unión (COPAYNI-89). Es su propia entidad y no
 * `AuthChallenge`, que es del login: aquí el sujeto es el acuerdo, no la sesión. Reutiliza la
 * política de OTP (pending-scope R10) para plazos, intentos y reenvíos.
 *
 * El código solo existe como hash; compararlo es tarea de la aplicación (en tiempo constante),
 * que informa aquí si coincidió.
 */
export class SignatureChallenge {
  private constructor(private state: SignatureChallengeState) {}

  static issue(props: {
    id: string;
    agreementId: string;
    codeHash: string;
    now: Date;
    policy: OtpPolicy;
  }): SignatureChallenge {
    const { now, policy } = props;
    return new SignatureChallenge({
      id: props.id,
      agreementId: props.agreementId,
      codeHash: props.codeHash,
      status: 'pending',
      attemptsRemaining: policy.maxAttempts,
      resendsRemaining: policy.maxResends,
      expiresAt: addSeconds(now, policy.codeTtlSeconds),
      resendAvailableAt: addSeconds(now, policy.resendCooldownSeconds),
      createdAt: now,
    });
  }

  static restore(state: SignatureChallengeState): SignatureChallenge {
    return new SignatureChallenge({ ...state });
  }

  get snapshot(): SignatureChallengeState {
    return { ...this.state };
  }

  get codeHash(): string {
    return this.state.codeHash;
  }

  /** Si todavía se puede intentar: comprobarlo antes de comparar el código. */
  check(now: Date): SignatureOutcome | null {
    if (this.state.status === 'locked') return { kind: 'attempts_exceeded' };
    if (this.state.status === 'consumed' || now >= this.state.expiresAt) return { kind: 'expired' };
    return null;
  }

  /** Registra un intento con el resultado de la comparación del código. */
  attempt(codeMatches: boolean, now: Date): SignatureOutcome {
    const blocked = this.check(now);
    if (blocked) return blocked;
    if (codeMatches) {
      this.state = { ...this.state, status: 'consumed' };
      return { kind: 'verified', agreementId: this.state.agreementId };
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
    if (now < this.state.resendAvailableAt) {
      throw new RateLimitedError(secondsBetween(now, this.state.resendAvailableAt));
    }
    if (this.state.resendsRemaining === 0) {
      // Sin reenvíos: hay que esperar a que venza y pedir otro código.
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
