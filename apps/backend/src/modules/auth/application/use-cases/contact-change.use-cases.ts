import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import {
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from '../../../../shared/errors/app-error';
import {
  ContactTakenError,
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../../users/application/ports/user-repository.port';
import { type User } from '../../../users/domain/entities/user';
import {
  LoginIdentifier,
  type LoginIdentifierType,
} from '../../../users/domain/value-objects/login-identifier';
import {
  AuthChallenge,
  OtpExpiredError,
  verificationError,
} from '../../domain/entities/auth-challenge';
import {
  AUTH_CHALLENGE_REPOSITORY,
  AUTH_POLICY,
  type AuthChallengeRepositoryPort,
  type AuthPolicy,
  CONTACT_CHANGES,
  type ContactChangeRepositoryPort,
  OTP_GENERATOR,
  OTP_HASHER,
  OTP_SENDER,
  type OtpGeneratorPort,
  type OtpHasherPort,
  type OtpSenderPort,
} from '../ports/auth.ports';
import { type ChallengeView } from './otp.use-cases';

/**
 * `POST /v1/me/contact/start` (COPAYNI-45). Supuesto R9: cambiar el email o el teléfono exige
 * verificar un OTP enviado al dato nuevo. No dice si el dato ya está en otra cuenta: eso se
 * responde al verificar, cuando el usuario ya probó que el dato es suyo.
 */
@Injectable()
export class StartContactChangeUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(AUTH_CHALLENGE_REPOSITORY) private readonly challenges: AuthChallengeRepositoryPort,
    @Inject(CONTACT_CHANGES) private readonly changes: ContactChangeRepositoryPort,
    @Inject(OTP_GENERATOR) private readonly generator: OtpGeneratorPort,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasherPort,
    @Inject(OTP_SENDER) private readonly sender: OtpSenderPort,
    @Inject(AUTH_POLICY) private readonly policy: AuthPolicy,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(
    principal: Principal,
    input: { identifier: string; type: LoginIdentifierType },
  ): Promise<ChallengeView> {
    const identifier = LoginIdentifier.parse(input.identifier, input.type);
    const user = await this.users.findById(principal.userId);
    if (!user) throw new NotFoundError('No se encontró el usuario', 'USER_NOT_FOUND');
    if ((identifier.type === 'email' ? user.email : user.phone) === identifier.value) {
      throw new ValidationError('Es el dato que ya tienes', { identifier: 'unchanged' });
    }
    const now = this.clock.now();
    const { startMaxPerWindow, startWindowSeconds } = this.policy;
    const recent = await this.challenges.issuedSince(
      user.id,
      new Date(now.getTime() - startWindowSeconds * 1000),
    );
    if (recent.count >= startMaxPerWindow && recent.oldest) {
      const reopensAt = recent.oldest.getTime() + startWindowSeconds * 1000;
      throw new RateLimitedError((reopensAt - now.getTime()) / 1000);
    }

    const id = randomUUID();
    const code = this.generator.generate();
    const challenge = AuthChallenge.issue({
      id,
      userId: user.id,
      channel: identifier.channel,
      codeHash: this.hasher.hash(id, code),
      now,
      policy: this.policy.otp,
    });
    await this.challenges.create(challenge);
    await this.changes.create(id, {
      userId: user.id,
      type: identifier.type,
      value: identifier.value,
    });
    await this.sender.send({ channel: identifier.channel, destination: identifier.value, code });
    this.logger.log({
      event: 'auth.contact_change_started',
      userId: user.id,
      type: identifier.type,
    });
    const { channel, expiresAt, resendAvailableAt } = challenge.snapshot;
    return {
      challengeId: id,
      channel,
      maskedDestination: identifier.masked(),
      expiresAt,
      resendAvailableAt,
    };
  }
}

/**
 * `POST /v1/me/contact/verify` (COPAYNI-45): con el código correcto aplica el dato nuevo. Si otra
 * cuenta ya lo tiene, responde CONTACT_TAKEN y no cambia nada.
 */
@Injectable()
export class VerifyContactChangeUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(AUTH_CHALLENGE_REPOSITORY) private readonly challenges: AuthChallengeRepositoryPort,
    @Inject(CONTACT_CHANGES) private readonly changes: ContactChangeRepositoryPort,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasherPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(principal: Principal, input: { challengeId: string; code: string }): Promise<User> {
    const change = await this.changes.find(input.challengeId);
    // Un desafío ajeno o ya usado se responde como vencido: no revela nada.
    if (!change || change.userId !== principal.userId || change.appliedAt) {
      throw new OtpExpiredError();
    }
    const now = this.clock.now();
    const outcome = await this.challenges.update(input.challengeId, (challenge) =>
      challenge.attempt(this.hasher.matches(challenge.id, input.code, challenge.codeHash), now),
    );
    if (!outcome) throw new OtpExpiredError();
    if (outcome.kind !== 'verified') {
      this.logger.warn({ event: 'auth.otp_rejected', reason: outcome.kind });
      throw verificationError(outcome);
    }

    const user = await this.users.findById(principal.userId);
    if (!user) throw new OtpExpiredError();
    const identifier = LoginIdentifier.parse(change.value, change.type);
    const owner = await this.users.findByIdentifier(identifier);
    if (owner && owner.id !== user.id) throw new ContactTakenError();
    user.changeContact(identifier);
    await this.users.save(user);
    await this.changes.markApplied(input.challengeId);
    this.logger.log({ event: 'auth.contact_changed', userId: user.id, type: change.type });
    return user;
  }
}
