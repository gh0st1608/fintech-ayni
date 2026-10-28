import {
  AuthChallenge,
  OtpAttemptsExceededError,
  OtpExpiredError,
  OtpInvalidError,
  verificationError,
} from '@src/modules/auth/domain/entities/auth-challenge';
import { type OtpPolicy } from '@src/modules/auth/domain/value-objects/otp-policy';
import { RateLimitedError } from '@src/shared/errors/app-error';

const POLICY: OtpPolicy = {
  codeTtlSeconds: 300,
  resendCooldownSeconds: 30,
  maxAttempts: 3,
  maxResends: 1,
};
const T0 = new Date('2026-11-02T15:00:00Z');
const at = (seconds: number) => new Date(T0.getTime() + seconds * 1000);

const issue = () =>
  AuthChallenge.issue({
    id: 'ch-1',
    userId: 'u-1',
    channel: 'email',
    codeHash: 'hash-1',
    now: T0,
    policy: POLICY,
  });

describe('AuthChallenge', () => {
  it('se emite con los intentos, reenvíos y plazos de la política', () => {
    expect(issue().snapshot).toEqual({
      id: 'ch-1',
      userId: 'u-1',
      channel: 'email',
      codeHash: 'hash-1',
      status: 'pending',
      attemptsRemaining: 3,
      resendsRemaining: 1,
      expiresAt: at(300),
      resendAvailableAt: at(30),
      issuedAt: T0,
    });
  });

  it('un código correcto verifica una sola vez', () => {
    const challenge = issue();
    expect(challenge.attempt(true, at(10))).toEqual({ kind: 'verified', userId: 'u-1' });
    expect(challenge.attempt(true, at(11))).toEqual({ kind: 'expired' });
  });

  it('cada fallo descuenta un intento y el último bloquea el desafío', () => {
    const challenge = issue();
    expect(challenge.attempt(false, at(1))).toEqual({ kind: 'invalid', attemptsRemaining: 2 });
    expect(challenge.attempt(false, at(2))).toEqual({ kind: 'invalid', attemptsRemaining: 1 });
    expect(challenge.attempt(false, at(3))).toEqual({ kind: 'attempts_exceeded' });
    // Bloqueado: ni el código correcto sirve.
    expect(challenge.attempt(true, at(4))).toEqual({ kind: 'attempts_exceeded' });
    expect(challenge.snapshot.status).toBe('locked');
  });

  it('un código vencido no verifica', () => {
    expect(issue().attempt(true, at(300))).toEqual({ kind: 'expired' });
  });

  it('reenviar antes del plazo responde RATE_LIMITED con los segundos restantes', () => {
    expect(() => issue().resend({ codeHash: 'hash-2', now: at(10), policy: POLICY })).toThrow(
      expect.objectContaining({ code: 'RATE_LIMITED', retryAfterSeconds: 20 }),
    );
  });

  it('reenviar reemplaza el código y reinicia intentos y plazos, incluso si estaba bloqueado', () => {
    const challenge = issue();
    for (let i = 0; i < 3; i += 1) challenge.attempt(false, at(1));
    challenge.resend({ codeHash: 'hash-2', now: at(40), policy: POLICY });

    expect(challenge.snapshot).toMatchObject({
      codeHash: 'hash-2',
      status: 'pending',
      attemptsRemaining: 3,
      resendsRemaining: 0,
      expiresAt: at(340),
      resendAvailableAt: at(70),
    });
  });

  it('sin reenvíos disponibles hay que esperar a que venza', () => {
    const challenge = issue();
    challenge.resend({ codeHash: 'hash-2', now: at(40), policy: POLICY });
    expect(() => challenge.resend({ codeHash: 'hash-3', now: at(100), policy: POLICY })).toThrow(
      expect.objectContaining({ retryAfterSeconds: 240 }),
    );
    expect(() => challenge.resend({ codeHash: 'hash-3', now: at(400), policy: POLICY })).toThrow(
      expect.objectContaining({ retryAfterSeconds: 1 }),
    );
  });

  it('un desafío ya verificado no se reenvía', () => {
    const challenge = issue();
    challenge.attempt(true, at(1));
    expect(() => challenge.resend({ codeHash: 'h', now: at(60), policy: POLICY })).toThrow(
      OtpExpiredError,
    );
  });

  it('restore conserva el estado guardado', () => {
    const state = { ...issue().snapshot, status: 'locked' as const, attemptsRemaining: 0 };
    expect(AuthChallenge.restore(state).check(at(1))).toEqual({ kind: 'attempts_exceeded' });
    expect(AuthChallenge.restore(state).codeHash).toBe('hash-1');
  });

  it('traduce cada resultado al error del contrato', () => {
    const invalid = verificationError({ kind: 'invalid', attemptsRemaining: 2 });
    expect(invalid).toBeInstanceOf(OtpInvalidError);
    expect(invalid).toMatchObject({ code: 'OTP_INVALID', details: { attemptsRemaining: '2' } });
    expect(verificationError({ kind: 'attempts_exceeded' })).toBeInstanceOf(
      OtpAttemptsExceededError,
    );
    expect(verificationError({ kind: 'expired' })).toBeInstanceOf(OtpExpiredError);
    expect(new RateLimitedError(5).kind).toBe('rate_limited');
  });
});
