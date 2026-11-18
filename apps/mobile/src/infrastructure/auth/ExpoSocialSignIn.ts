import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { openAuthSessionAsync } from 'expo-web-browser';
import { Platform } from 'react-native';

import type { SocialSignInPort } from '@/domain/auth/ports/SocialAuthPorts';
import type {
  SocialProvider,
  SocialProviderStatus,
  SocialSignInResult,
} from '@/domain/auth/SocialLogin';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

export interface SocialSignInSettings {
  /** Esquema de la app para la vuelta del navegador (`ayni://`). */
  scheme: string;
}

/** Nonce de este intento: aleatorio y de un solo uso. */
const newNonce = (): string =>
  Crypto.randomUUID().replace(/-/g, '') + Crypto.randomUUID().replace(/-/g, '');

/**
 * Inicio de sesión con los proveedores (COPAYNI-91 §9 y §10). Necesita un **development build**:
 * en Expo Go no hay módulo nativo de Apple y la vuelta del navegador no llega a la app.
 *
 * Solo Apple en iOS usa un SDK nativo. Google y Apple-en-Android pasan por el navegador con un
 * flujo que coordina el backend, porque Google no admite un esquema propio (`ayni://`) como
 * `redirect_uri` ni el flujo implícito en apps instaladas: el `redirect_uri` es el callback HTTPS
 * de la API y el canje ocurre allí, con un client secret que nunca llega al dispositivo. A la app
 * vuelve solo un código interno de un solo uso, nunca un token.
 */
export class ExpoSocialSignIn implements SocialSignInPort {
  constructor(
    private readonly settings: SocialSignInSettings,
    /** Para el flujo web de Apple en Android, que lo coordina el backend. */
    private readonly http: HttpClientPort,
  ) {}

  async isAvailable(provider: SocialProvider, status: SocialProviderStatus): Promise<boolean> {
    // Google siempre va por el navegador, también en iOS.
    if (provider === 'google') return status.web;
    // Apple nativo solo existe en iOS; en el resto se ofrece por el navegador.
    if (Platform.OS !== 'ios') return status.web;
    return status.native && (await AppleAuthentication.isAvailableAsync());
  }

  signIn(provider: SocialProvider): Promise<SocialSignInResult> {
    if (provider === 'google') return this.webFlow('google');
    return Platform.OS === 'ios' ? this.appleNative() : this.webFlow('apple');
  }

  /** Apple en iOS: diálogo nativo. El nonce viaja tal cual y vuelve en el token. */
  private async appleNative(): Promise<SocialSignInResult> {
    const nonce = newNonce();
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });
      if (!credential.identityToken) return { status: 'cancelled' };
      return {
        status: 'credential',
        credential: { provider: 'apple', idToken: credential.identityToken, nonce },
      };
    } catch (error) {
      // Cerrar el diálogo llega como error del SDK; no es un fallo que mostrar.
      if (isCancellation(error)) return { status: 'cancelled' };
      throw error;
    }
  }

  /**
   * Flujo por navegador: el backend abre el intento (guarda `state`, `nonce` y, en Google, el
   * `code_verifier` de PKCE), la persona autoriza y el proveedor vuelve al callback del backend,
   * que redirige a la app con un código interno de un solo uso. Por el deep link no viaja ningún
   * token.
   */
  private async webFlow(provider: SocialProvider): Promise<SocialSignInResult> {
    const { authorizationUrl } = await this.http.post<{ authorizationUrl: string }>(
      `/auth/social/${provider}/authorize`,
      { skipSessionRefresh: true, parse: (data) => data as { authorizationUrl: string } },
    );
    const returnUrl = `${this.settings.scheme}://auth/social`;
    const result = await openAuthSessionAsync(authorizationUrl, returnUrl);
    if (result.type !== 'success') return { status: 'cancelled' };

    const params = new URL(result.url).searchParams;
    const code = params.get('code');
    if (!code) return { status: 'cancelled' };
    return { status: 'session', exchangeCode: code };
  }
}

/** Los códigos con los que cada SDK avisa de que la persona cerró el diálogo. */
const CANCELLATIONS = ['ERR_REQUEST_CANCELED', 'ERR_CANCELED', 'ERR_REQUEST_UNKNOWN'];

function isCancellation(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && CANCELLATIONS.includes(code);
}

/** Doble para desarrollo y pruebas: no toca SDK nativos ni abre el navegador. */
export class FakeSocialSignIn implements SocialSignInPort {
  constructor(
    private state: {
      available?: SocialProvider[];
      result?: SocialSignInResult;
    } = {},
  ) {}

  readonly attempts: SocialProvider[] = [];

  isAvailable(provider: SocialProvider, status: SocialProviderStatus): Promise<boolean> {
    const admitted = (this.state.available ?? ['google', 'apple']).includes(provider);
    return Promise.resolve(admitted && (status.native || status.web));
  }

  signIn(provider: SocialProvider): Promise<SocialSignInResult> {
    this.attempts.push(provider);
    return Promise.resolve(
      this.state.result ?? {
        status: 'credential',
        credential: {
          provider,
          idToken: `fake.${provider}.id-token`,
          nonce: 'nonce-de-prueba-suficientemente-largo',
        },
      },
    );
  }

  set(result: SocialSignInResult): void {
    this.state = { ...this.state, result };
  }
}
