import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { type AppError, DomainError, RateLimitedError } from '../../../../shared/errors/app-error';
import {
  PASSCODE_HASHER,
  PASSCODE_POLICY,
  PASSCODE_REPOSITORY,
  type LockedPasscode,
  type PasscodeHasherPort,
  type PasscodePolicy,
  type PasscodeRepositoryPort,
} from '../ports/passcode.ports';

/**
 * Comprueba el passcode actual con el límite de intentos. Compartido por cambio y verificación.
 * Siempre corre dentro de `withLock`, así dos intentos simultáneos no comparan más candidatos que
 * el límite ni un acierto borra el bloqueo que activó otro intento.
 */
@Injectable()
export class PasscodeChecker {
  constructor(
    @Inject(PASSCODE_HASHER) private readonly hasher: PasscodeHasherPort,
    @Inject(PASSCODE_POLICY) private readonly policy: PasscodePolicy,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  /** Devuelve el rechazo en vez de lanzarlo: el fallo registrado debe confirmarse igual. */
  async attempt(locked: LockedPasscode, passcode: string): Promise<AppError | null> {
    const stored = await locked.find();
    if (!stored) return new DomainError('PASSCODE_NOT_SET', 'No tienes un passcode');
    const now = this.clock.now();
    if (stored.lockedUntil && stored.lockedUntil > now) {
      return new RateLimitedError(
        Math.ceil((stored.lockedUntil.getTime() - now.getTime()) / 1000),
        'Demasiados intentos con el passcode',
      );
    }
    if (await this.hasher.matches(passcode, stored.hash)) {
      await locked.clearFailures();
      return null;
    }
    const lockUntil = new Date(now.getTime() + this.policy.lockSeconds * 1000);
    const failures = await locked.recordFailure(this.policy.maxAttempts, lockUntil);
    return new DomainError('PASSCODE_INVALID', 'Passcode incorrecto', {
      attemptsRemaining: String(Math.max(this.policy.maxAttempts - failures, 0)),
    });
  }
}

/** `GET /v1/me/passcode` (COPAYNI-23). */
@Injectable()
export class GetPasscodeStatusUseCase {
  constructor(@Inject(PASSCODE_REPOSITORY) private readonly passcodes: PasscodeRepositoryPort) {}

  async execute({ userId }: Principal): Promise<{ configured: boolean }> {
    return { configured: (await this.passcodes.find(userId)) !== null };
  }
}

type SetOutcome = { rejection: AppError; created: false } | { rejection: null; created: boolean };

/**
 * `PUT /v1/me/passcode` (COPAYNI-23). El primero se crea sin más: la sesión ya está autenticada. Para
 * cambiarlo hay que enviar el actual. El cambio queda auditado en el log, nunca el valor.
 */
@Injectable()
export class SetPasscodeUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(PASSCODE_REPOSITORY) private readonly passcodes: PasscodeRepositoryPort,
    @Inject(PASSCODE_HASHER) private readonly hasher: PasscodeHasherPort,
    @Inject(PasscodeChecker) private readonly checker: PasscodeChecker,
  ) {}

  async execute(
    { userId }: Principal,
    input: { currentPasscode?: string; newPasscode: string },
  ): Promise<void> {
    // Bajo el mismo bloqueo: dos creaciones simultáneas no se pisan y un cambio no reemplaza un
    // passcode distinto del que se verificó.
    const outcome = await this.passcodes.withLock<SetOutcome>(userId, async (locked) => {
      const existing = await locked.find();
      if (existing) {
        const rejection = await this.checker.attempt(locked, input.currentPasscode ?? '');
        if (rejection) return { rejection, created: false };
      }
      await locked.save(await this.hasher.hash(input.newPasscode));
      return { rejection: null, created: !existing };
    });
    if (outcome.rejection) throw outcome.rejection;
    this.logger.log({ event: 'auth.passcode.changed', userId, created: outcome.created });
  }
}

/** `POST /v1/me/passcode/verify`: método alternativo de desbloqueo (COPAYNI-22 y 23). */
@Injectable()
export class VerifyPasscodeUseCase {
  constructor(
    @Inject(PASSCODE_REPOSITORY) private readonly passcodes: PasscodeRepositoryPort,
    @Inject(PasscodeChecker) private readonly checker: PasscodeChecker,
  ) {}

  async execute({ userId }: Principal, passcode: string): Promise<void> {
    const rejection = await this.passcodes.withLock(userId, (locked) =>
      this.checker.attempt(locked, passcode),
    );
    if (rejection) throw rejection;
  }
}
