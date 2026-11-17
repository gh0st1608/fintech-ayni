import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/errors/app-error';
import {
  USER_REPOSITORY,
  type UserRepositoryPort,
} from '../../../users/application/ports/user-repository.port';
import { LoginIdentifier } from '../../../users/domain/value-objects/login-identifier';
import {
  type ExternalIdentity,
  type IdentityProvider,
  type VerifiedIdentity,
} from '../../domain/entities/external-identity';
import {
  EXTERNAL_IDENTITIES,
  IDENTITY_PROVIDERS_PORT,
  type ExternalIdentitiesPort,
  type IdentityProvidersPort,
} from '../ports/social-auth.ports';
import { type AuthTokens, SessionIssuer } from '../services/session-issuer';

/** Ese correo ya es de otra cuenta: no se vincula solo (COPAYNI-91 §11, QA-12). */
export class SocialEmailTakenError extends ConflictError {
  constructor() {
    super(
      'SOCIAL_EMAIL_TAKEN',
      'Ya existe una cuenta con ese correo. Inicia sesión como siempre y vincula el proveedor desde tu perfil.',
    );
  }
}

/** La identidad ya está vinculada a otra persona: nunca se mueve de cuenta sola. */
export class SocialIdentityTakenError extends ConflictError {
  constructor() {
    super('SOCIAL_IDENTITY_TAKEN', 'Esa cuenta del proveedor ya está vinculada a otro usuario');
  }
}

/**
 * Sin correo del proveedor no se puede abrir una cuenta: en Ayni un usuario necesita email o
 * teléfono para que podamos escribirle (restricción `ck_users_identifier`). Pasa si la persona
 * oculta su correo sin compartirlo o si el proveedor no lo entrega.
 */
export class SocialEmailRequiredError extends ValidationError {
  constructor() {
    super('Para crear tu cuenta necesitamos tu correo. Compártelo e inténtalo de nuevo.', {
      email: 'required',
    });
  }
}

export interface SocialLoginInput {
  provider: IdentityProvider;
  idToken: string;
  /** El nonce que la app generó para este intento; siempre se exige. */
  nonce: string;
}

/**
 * Entrar con Google o Apple (COPAYNI-91). El proveedor autentica y firma una credencial; Ayni la
 * verifica, resuelve o crea la cuenta y emite **su propia** sesión con el mismo mecanismo del OTP:
 * los tokens del proveedor nunca son la sesión de Ayni.
 *
 * La cuenta se resuelve por `provider + sub`, nunca por correo: el correo cambia y Apple puede no
 * volver a entregarlo.
 */
@Injectable()
export class SocialLoginUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(IDENTITY_PROVIDERS_PORT) private readonly providers: IdentityProvidersPort,
    @Inject(EXTERNAL_IDENTITIES) private readonly identities: ExternalIdentitiesPort,
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(SessionIssuer) private readonly sessions: SessionIssuer,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: SocialLoginInput): Promise<AuthTokens> {
    return this.issueFor(await this.resolveUserId(input));
  }

  /**
   * Verifica la credencial y devuelve de quién es, creando la cuenta si es su primer inicio. El
   * flujo web de Apple lo usa aparte, porque allí la sesión se emite al canjear el código.
   */
  async resolveUserId(input: SocialLoginInput): Promise<string> {
    const verified = await this.providers.of(input.provider).verify({
      idToken: input.idToken,
      nonce: input.nonce,
    });
    const now = this.clock.now();

    const existing = await this.identities.find(verified.provider, verified.subject);
    if (existing) {
      await this.identities.touch(existing.id, now);
      this.logger.log({
        event: 'auth.social_login',
        provider: verified.provider,
        userId: existing.userId,
        created: false,
      });
      return existing.userId;
    }

    const identity = await this.register(verified, now);
    this.logger.log({
      event: 'auth.social_login',
      provider: verified.provider,
      userId: identity.userId,
      created: true,
    });
    return identity.userId;
  }

  /** Emite la sesión de Ayni con el mismo mecanismo del OTP (bloqueos y familias incluidos). */
  issueFor(userId: string): Promise<AuthTokens> {
    return this.sessions.issue(userId);
  }

  /** Alta: el correo del proveedor abre la cuenta solo si no es de nadie más. */
  private async register(verified: VerifiedIdentity, now: Date): Promise<ExternalIdentity> {
    if (!verified.email) throw new SocialEmailRequiredError();
    const identifier = LoginIdentifier.parse(verified.email, 'email');
    const owner = await this.users.findByIdentifier(identifier);
    // Coincidir en el correo no prueba que sea la misma persona: vincular se hace con sesión.
    if (owner) throw new SocialEmailTakenError();
    return this.identities.registerWithUser({
      identity: verified,
      email: identifier.value,
      at: now,
    });
  }
}

/** Vincular un proveedor a la cuenta con la que ya se inició sesión (COPAYNI-91 §11). */
@Injectable()
export class LinkSocialIdentityUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(IDENTITY_PROVIDERS_PORT) private readonly providers: IdentityProvidersPort,
    @Inject(EXTERNAL_IDENTITIES) private readonly identities: ExternalIdentitiesPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(userId: string, input: SocialLoginInput): Promise<void> {
    const verified = await this.providers.of(input.provider).verify({
      idToken: input.idToken,
      nonce: input.nonce,
    });
    const existing = await this.identities.find(verified.provider, verified.subject);
    if (existing) {
      // Repetirlo no es un error; lo que no se admite es moverla de cuenta.
      if (existing.userId !== userId) throw new SocialIdentityTakenError();
      return;
    }
    await this.identities.link(userId, verified, this.clock.now());
    this.logger.log({ event: 'auth.social_linked', provider: verified.provider, userId });
  }
}

/** Desvincular un proveedor. La persona conserva su email o teléfono para entrar con OTP. */
@Injectable()
export class UnlinkSocialIdentityUseCase {
  private readonly logger = new Logger('Auth');

  constructor(@Inject(EXTERNAL_IDENTITIES) private readonly identities: ExternalIdentitiesPort) {}

  async execute(userId: string, provider: IdentityProvider): Promise<void> {
    const unlinked = await this.identities.unlink(userId, provider);
    if (!unlinked) throw new NotFoundError('No tienes ese proveedor vinculado');
    this.logger.log({ event: 'auth.social_unlinked', provider, userId });
  }
}

/** Qué proveedores tiene vinculados la persona, para mostrarlo en el perfil. */
@Injectable()
export class ListSocialIdentitiesUseCase {
  constructor(@Inject(EXTERNAL_IDENTITIES) private readonly identities: ExternalIdentitiesPort) {}

  execute(userId: string): Promise<ExternalIdentity[]> {
    return this.identities.ofUser(userId);
  }
}
