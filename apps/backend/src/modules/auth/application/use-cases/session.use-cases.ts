import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { UnauthorizedError } from '../../../../shared/errors/app-error';
import {
  REFRESH_TOKEN_REPOSITORY,
  REFRESH_TOKEN_SECRETS,
  type RefreshTokenRepositoryPort,
  type RefreshTokenSecretsPort,
} from '../ports/auth.ports';
import { type AuthTokens, SessionIssuer } from '../services/session-issuer';

/**
 * `POST /auth/refresh` (COPAYNI-21). Rotación obligatoria: el token recibido deja de valer. Si
 * llega uno ya usado (posible robo), se revoca toda la sesión y ambos dispositivos tienen que
 * volver a ingresar.
 */
@Injectable()
export class RefreshSessionUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(REFRESH_TOKEN_SECRETS) private readonly secrets: RefreshTokenSecretsPort,
    @Inject(SessionIssuer) private readonly sessions: SessionIssuer,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(refreshToken: string): Promise<AuthTokens> {
    const now = this.clock.now();
    const use = await this.refreshTokens.consume(this.secrets.hashOf(refreshToken), now);
    if (use.status === 'reused') {
      await this.refreshTokens.revokeFamily(use.familyId, now);
      this.logger.warn({ event: 'auth.refresh_reuse_detected', familyId: use.familyId });
    }
    if (use.status !== 'valid') throw new UnauthorizedError('La sesión expiró');
    return this.sessions.issue(use.userId, use.familyId);
  }
}

/** `POST /auth/logout`: revoca la sesión del refresh token. Idempotente y sin Authorization. */
@Injectable()
export class LogoutUseCase {
  constructor(
    @Inject(REFRESH_TOKEN_REPOSITORY) private readonly refreshTokens: RefreshTokenRepositoryPort,
    @Inject(REFRESH_TOKEN_SECRETS) private readonly secrets: RefreshTokenSecretsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(refreshToken: string): Promise<void> {
    await this.refreshTokens.revokeFamilyOf(this.secrets.hashOf(refreshToken), this.clock.now());
  }
}
