import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { DomainError, RateLimitedError } from '../../../../shared/errors/app-error';
import {
  PASSCODE_HASHER,
  PASSCODE_POLICY,
  PASSCODE_REPOSITORY,
  type PasscodeHasherPort,
  type PasscodePolicy,
  type PasscodeRepositoryPort,
} from '../ports/passcode.ports';

/** Comprueba el passcode actual con el límite de intentos. Compartido por cambio y verificación. */
@Injectable()
export class PasscodeChecker {
  constructor(
    @Inject(PASSCODE_REPOSITORY) private readonly passcodes: PasscodeRepositoryPort,
    @Inject(PASSCODE_HASHER) private readonly hasher: PasscodeHasherPort,
    @Inject(PASSCODE_POLICY) private readonly policy: PasscodePolicy,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async check(userId: string, passcode: string): Promise<void> {
    const stored = await this.passcodes.find(userId);
    if (!stored) throw new DomainError('PASSCODE_NOT_SET', 'No tienes un passcode');
    const now = this.clock.now();
    if (stored.lockedUntil && stored.lockedUntil > now) {
      throw new RateLimitedError(
        Math.ceil((stored.lockedUntil.getTime() - now.getTime()) / 1000),
        'Demasiados intentos con el passcode',
      );
    }
    if (await this.hasher.matches(passcode, stored.hash)) {
      await this.passcodes.clearFailures(userId);
      return;
    }
    const lockUntil = new Date(now.getTime() + this.policy.lockSeconds * 1000);
    const failures = await this.passcodes.recordFailure(userId, this.policy.maxAttempts, lockUntil);
    throw new DomainError('PASSCODE_INVALID', 'Passcode incorrecto', {
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
    const existing = await this.passcodes.find(userId);
    if (existing) await this.checker.check(userId, input.currentPasscode ?? '');
    await this.passcodes.save(userId, await this.hasher.hash(input.newPasscode));
    this.logger.log({ event: 'auth.passcode.changed', userId, created: !existing });
  }
}

/** `POST /v1/me/passcode/verify`: método alternativo de desbloqueo (COPAYNI-22 y 23). */
@Injectable()
export class VerifyPasscodeUseCase {
  constructor(@Inject(PasscodeChecker) private readonly checker: PasscodeChecker) {}

  execute({ userId }: Principal, passcode: string): Promise<void> {
    return this.checker.check(userId, passcode);
  }
}
