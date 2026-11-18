import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { InfrastructureError } from '../../../../shared/errors/app-error';
import {
  GOOGLE_WEB_FLOW,
  type GoogleWebFlowPort,
  SOCIAL_AUTH_FLOWS,
  SOCIAL_AUTH_SETTINGS,
  type SocialAuthFlowsPort,
  type SocialAuthSettings,
} from '../ports/social-auth.ports';
import { invalidFlow, pkceChallenge, secret, sha256 } from './social-flow.helpers';
import { SocialLoginUseCase } from './social-login.use-cases';

/**
 * Entrar con Google (COPAYNI-91 §9). El inicio pasa por el navegador y lo coordina el backend, no
 * el dispositivo, por dos reglas de Google que no se pueden sortear desde la app:
 *
 * - un cliente OAuth de tipo **Web** solo admite `redirect_uri` HTTPS, nunca un esquema propio
 *   como `ayni://`;
 * - en apps instaladas Google exige `response_type=code` con PKCE, no el flujo implícito.
 *
 * Por eso el `redirect_uri` apunta al callback HTTPS de la API y el canje ocurre aquí, con el
 * client secret del cliente Web, que nunca viaja al dispositivo. A la app solo vuelve un código
 * interno de un solo uso, igual que en el flujo web de Apple.
 */
@Injectable()
export class StartGoogleWebFlowUseCase {
  constructor(
    @Inject(SOCIAL_AUTH_FLOWS) private readonly flows: SocialAuthFlowsPort,
    @Inject(SOCIAL_AUTH_SETTINGS) private readonly settings: SocialAuthSettings,
    @Inject(GOOGLE_WEB_FLOW) private readonly google: GoogleWebFlowPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(): Promise<{ authorizationUrl: string; state: string }> {
    // Sin credenciales no se abre un intento que Google va a rechazar: 503, como el resto de lo
    // que depende de un tercero. A diferencia de Apple, aquí el paso de autorización ya necesita
    // el client id y el redirect registrados, no solo el canje.
    if (!this.google.isConfigured()) {
      throw new InfrastructureError('El inicio de sesión con google no está disponible');
    }
    const state = secret();
    const nonce = secret();
    const codeVerifier = secret();
    const expiresAt = new Date(this.clock.now().getTime() + this.settings.flowTtlSeconds * 1000);
    await this.flows.create({ state, nonce, provider: 'google', expiresAt, codeVerifier });

    const url = new URL(this.settings.google.authorizationUrl);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.settings.google.clientId);
    url.searchParams.set('redirect_uri', this.settings.google.redirectUri);
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('state', state);
    // El nonce lo elige el servidor y vuelve dentro del ID Token: ata el token a este intento.
    url.searchParams.set('nonce', nonce);
    url.searchParams.set('code_challenge', pkceChallenge(codeVerifier));
    url.searchParams.set('code_challenge_method', 'S256');
    // Sin esto, quien ya tenga sesión en el navegador entra con esa cuenta sin poder elegir.
    url.searchParams.set('prompt', 'select_account');
    return { authorizationUrl: url.toString(), state };
  }
}

/**
 * Vuelta de Google al callback HTTPS. Valida el `state` (de un solo uso), canjea el código con el
 * `code_verifier` guardado, verifica el ID Token con el nonce del intento y deja listo un código
 * interno de un solo uso.
 */
@Injectable()
export class CompleteGoogleWebFlowUseCase {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(SOCIAL_AUTH_FLOWS) private readonly flows: SocialAuthFlowsPort,
    @Inject(GOOGLE_WEB_FLOW) private readonly google: GoogleWebFlowPort,
    @Inject(SocialLoginUseCase) private readonly login: SocialLoginUseCase,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(input: { state: string; code: string }): Promise<string> {
    const flow = await this.flows.consumeState(input.state, this.clock.now());
    // El proveedor se comprueba: un intento abierto para Apple no se completa por aquí.
    if (!flow || flow.provider !== 'google' || !flow.codeVerifier) {
      this.logger.warn({ event: 'auth.social_state_rejected', provider: 'google' });
      throw invalidFlow();
    }

    const idToken = await this.google.exchange({
      code: input.code,
      codeVerifier: flow.codeVerifier,
    });
    const userId = await this.login.resolveUserId({
      provider: 'google',
      idToken,
      nonce: flow.nonce,
    });
    const exchangeCode = secret();
    await this.flows.attachExchangeCode(flow.state, userId, sha256(exchangeCode));
    return exchangeCode;
  }
}
