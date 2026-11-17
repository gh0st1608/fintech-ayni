import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { UnauthorizedError } from '../../../../shared/errors/app-error';
import {
  APPLE_WEB_FLOW,
  type AppleWebFlowPort,
  SOCIAL_AUTH_FLOWS,
  SOCIAL_AUTH_SETTINGS,
  type SocialAuthFlowsPort,
  type SocialAuthSettings,
} from '../ports/social-auth.ports';
import { type AuthTokens } from '../services/session-issuer';
import { SocialLoginUseCase } from './social-login.use-cases';

/** Valor aleatorio de 32 bytes en base64url: 43 caracteres, los que guarda la base. */
const secret = (): string => randomBytes(32).toString('base64url');
const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

/** El intento no existe, ya se usó o venció. Siempre se responde lo mismo. */
const invalidFlow = (): UnauthorizedError =>
  new UnauthorizedError('El inicio de sesión no se pudo completar. Vuelve a intentarlo.');

/**
 * Apple en Android (COPAYNI-91 §9): Android no tiene Sign in with Apple nativo, así que el inicio
 * pasa por el navegador. Este caso de uso abre el intento: genera `state` y `nonce`, los guarda y
 * devuelve la URL de autorización.
 */
@Injectable()
export class StartAppleWebFlowUseCase {
  constructor(
    @Inject(SOCIAL_AUTH_FLOWS) private readonly flows: SocialAuthFlowsPort,
    @Inject(SOCIAL_AUTH_SETTINGS) private readonly settings: SocialAuthSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(): Promise<{ authorizationUrl: string; state: string }> {
    const state = secret();
    const nonce = secret();
    const expiresAt = new Date(this.clock.now().getTime() + this.settings.flowTtlSeconds * 1000);
    await this.flows.create({ state, nonce, provider: 'apple', expiresAt });

    const url = new URL(this.settings.apple.authorizationUrl);
    url.searchParams.set('response_type', 'code id_token');
    // `form_post` es lo que Apple exige cuando se piden scopes de correo o nombre.
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('client_id', this.settings.apple.serviceId);
    url.searchParams.set('redirect_uri', this.settings.apple.redirectUri);
    url.searchParams.set('scope', 'name email');
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    return { authorizationUrl: url.toString(), state };
  }
}

/**
 * Vuelta de Apple al callback HTTPS. Valida el `state` (de un solo uso), verifica el ID token con
 * el nonce guardado y deja listo un **código interno** de un solo uso.
 *
 * Por el deep link a la app no viaja ningún token de sesión: solo ese código, que se canjea una
 * vez y desde el mismo intento.
 */
@Injectable()
export class CompleteAppleWebFlowUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(SOCIAL_AUTH_FLOWS) private readonly flows: SocialAuthFlowsPort,
    @Inject(APPLE_WEB_FLOW) private readonly apple: AppleWebFlowPort,
    @Inject(SocialLoginUseCase) private readonly login: SocialLoginUseCase,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: { state: string; code?: string; idToken?: string }): Promise<string> {
    const now = this.clock.now();
    const flow = await this.flows.consumeState(input.state, now);
    if (!flow) {
      this.logger.warn({ event: 'auth.social_state_rejected', provider: 'apple' });
      throw invalidFlow();
    }

    // Apple manda el id_token en el form_post; si no llegó, se canjea el código con Apple.
    const idToken = input.idToken ?? (input.code ? await this.apple.exchange(input.code) : null);
    if (!idToken) throw invalidFlow();

    const userId = await this.login.resolveUserId({
      provider: 'apple',
      idToken,
      nonce: flow.nonce,
    });
    const exchangeCode = secret();
    await this.flows.attachExchangeCode(flow.state, userId, sha256(exchangeCode));
    return exchangeCode;
  }
}

/** La app canja el código interno por su sesión de Ayni. Una sola vez (QA-14). */
@Injectable()
export class ExchangeSocialCodeUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(SOCIAL_AUTH_FLOWS) private readonly flows: SocialAuthFlowsPort,
    @Inject(SocialLoginUseCase) private readonly login: SocialLoginUseCase,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(code: string): Promise<AuthTokens> {
    const flow = await this.flows.consumeExchangeCode(sha256(code), this.clock.now());
    if (!flow?.userId) {
      this.logger.warn({ event: 'auth.social_exchange_rejected' });
      throw invalidFlow();
    }
    return this.login.issueFor(flow.userId);
  }
}
