import { randomUUID } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { ForbiddenError } from '../../../../shared/errors/app-error';
import {
  ACCESS_TOKEN_ISSUER,
  ACCOUNT_ACCESS,
  type AccountAccessPort,
  type AccessTokenIssuerPort,
  AUTH_POLICY,
  type AuthPolicy,
  REFRESH_TOKEN_REPOSITORY,
  REFRESH_TOKEN_SECRETS,
  type RefreshTokenRepositoryPort,
  type RefreshTokenSecretsPort,
} from '../ports/auth.ports';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Emite un access token y un refresh token. Una verificación de OTP abre una sesión (familia)
 * nueva; cada renovación emite el siguiente token de la misma familia. Una persona bloqueada desde
 * el back-office no recibe sesión: ni al verificar el código ni al renovar.
 */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(ACCESS_TOKEN_ISSUER) private readonly accessTokens: AccessTokenIssuerPort,
    @Inject(REFRESH_TOKEN_SECRETS) private readonly secrets: RefreshTokenSecretsPort,
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(AUTH_POLICY) private readonly policy: AuthPolicy,
    @Inject(CLOCK) private readonly clock: ClockPort,
    @Inject(ACCOUNT_ACCESS) private readonly access: AccountAccessPort,
  ) {}

  async issue(userId: string, familyId: string = randomUUID()): Promise<AuthTokens> {
    if (await this.access.isBlocked(userId)) {
      throw new ForbiddenError('La cuenta está bloqueada. Escríbenos a soporte.', 'USER_BLOCKED');
    }
    const { token, tokenHash } = this.secrets.generate();
    await this.refreshTokens.create({
      familyId,
      userId,
      tokenHash,
      expiresAt: new Date(this.clock.now().getTime() + this.policy.refreshTokenTtlDays * DAY_MS),
    });
    return { accessToken: this.accessTokens.issue(userId), refreshToken: token };
  }
}
