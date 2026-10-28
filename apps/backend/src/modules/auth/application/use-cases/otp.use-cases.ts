import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { NotFoundError, RateLimitedError } from '../../../../shared/errors/app-error';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../../users/application/ports/user-repository.port';
import {
  LoginIdentifier,
  type LoginIdentifierType,
  type OtpChannel,
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
  OTP_GENERATOR,
  OTP_HASHER,
  OTP_SENDER,
  type OtpGeneratorPort,
  type OtpHasherPort,
  type OtpSenderPort,
} from '../ports/auth.ports';
import { type AuthTokens, SessionIssuer } from '../services/session-issuer';

/** Contrato `AuthChallenge` de docs/api/auth.md. */
export interface ChallengeView {
  challengeId: string;
  channel: OtpChannel;
  maskedDestination: string;
  expiresAt: Date;
  resendAvailableAt: Date;
}

const toView = (challenge: AuthChallenge, destination: LoginIdentifier): ChallengeView => {
  const { id, channel, expiresAt, resendAvailableAt } = challenge.snapshot;
  return {
    challengeId: id,
    channel,
    maskedDestination: destination.masked(),
    expiresAt,
    resendAvailableAt,
  };
};

/**
 * `POST /auth/start` (COPAYNI-19). Crea el usuario si no existe y le envía un OTP. La respuesta
 * es la misma exista o no el usuario. Los logs llevan el id del usuario, nunca el identificador
 * ni el código.
 */
@Injectable()
export class StartAuthenticationUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(AUTH_CHALLENGE_REPOSITORY) private readonly challenges: AuthChallengeRepositoryPort,
    @Inject(OTP_GENERATOR) private readonly generator: OtpGeneratorPort,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasherPort,
    @Inject(OTP_SENDER) private readonly sender: OtpSenderPort,
    @Inject(AUTH_POLICY) private readonly policy: AuthPolicy,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: { identifier: string; type: LoginIdentifierType }): Promise<ChallengeView> {
    const identifier = LoginIdentifier.parse(input.identifier, input.type);
    const now = this.clock.now();
    const user = await this.users.findOrRegister(identifier);

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
    await this.sender.send({ channel: identifier.channel, destination: identifier.value, code });
    this.logger.log({
      event: 'auth.challenge_issued',
      userId: user.id,
      channel: identifier.channel,
    });
    return toView(challenge, identifier);
  }
}

/** `POST /auth/verify` (COPAYNI-20). Un código correcto activa al usuario y abre una sesión. */
@Injectable()
export class VerifyOtpUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(AUTH_CHALLENGE_REPOSITORY) private readonly challenges: AuthChallengeRepositoryPort,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasherPort,
    @Inject(SessionIssuer) private readonly sessions: SessionIssuer,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: { challengeId: string; code: string }): Promise<AuthTokens> {
    const now = this.clock.now();
    // El intento fallido se guarda antes de responder el error.
    const outcome = await this.challenges.update(input.challengeId, (challenge) =>
      challenge.attempt(this.hasher.matches(challenge.id, input.code, challenge.codeHash), now),
    );
    if (!outcome) throw new OtpExpiredError();
    if (outcome.kind !== 'verified') {
      this.logger.warn({ event: 'auth.otp_rejected', reason: outcome.kind });
      throw verificationError(outcome);
    }

    const user = await this.users.findById(outcome.userId);
    if (!user) throw new OtpExpiredError();
    user.activate();
    await this.users.save(user);
    this.logger.log({ event: 'auth.otp_verified', userId: user.id });
    return this.sessions.issue(user.id);
  }
}

/** `POST /auth/resend`: código nuevo para el mismo desafío; el anterior deja de valer. */
@Injectable()
export class ResendOtpUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(AUTH_CHALLENGE_REPOSITORY) private readonly challenges: AuthChallengeRepositoryPort,
    @Inject(OTP_GENERATOR) private readonly generator: OtpGeneratorPort,
    @Inject(OTP_HASHER) private readonly hasher: OtpHasherPort,
    @Inject(OTP_SENDER) private readonly sender: OtpSenderPort,
    @Inject(AUTH_POLICY) private readonly policy: AuthPolicy,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: { challengeId: string }): Promise<ChallengeView> {
    const now = this.clock.now();
    const code = this.generator.generate();
    const challenge = await this.challenges.update(input.challengeId, (current) => {
      current.resend({
        codeHash: this.hasher.hash(current.id, code),
        now,
        policy: this.policy.otp,
      });
      return current;
    });
    if (!challenge) throw new NotFoundError('No se encontró el desafío');

    const { userId, channel } = challenge.snapshot;
    const destination = (await this.users.findById(userId))?.loginIdentifier(channel);
    if (!destination) throw new NotFoundError('No se encontró el desafío');
    await this.sender.send({ channel, destination: destination.value, code });
    this.logger.log({ event: 'auth.challenge_resent', userId, channel });
    return toView(challenge, destination);
  }
}
