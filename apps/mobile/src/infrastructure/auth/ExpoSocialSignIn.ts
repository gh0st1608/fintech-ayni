import * as AppleAuthentication from 'expo-apple-authentication';
import {
  AuthRequest,
  makeRedirectUri,
  ResponseType,
  type AuthSessionResult,
} from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import { openAuthSessionAsync } from 'expo-web-browser';
import { Platform } from 'react-native';

import type { SocialSignInPort } from '@/domain/auth/ports/SocialAuthPorts';
import type { SocialProvider, SocialSignInResult } from '@/domain/auth/SocialLogin';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

export interface SocialSignInSettings {
  /** Client id **Web** de Google: es el que pide el ID Token que valida el backend. */
  googleWebClientId: string;
  /** Esquema de la app para la vuelta del navegador (`ayni://`). */
  scheme: string;
}

const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';

/** Nonce de este intento: aleatorio y de un solo uso. */
const newNonce = (): string =>
  Crypto.randomUUID().replace(/-/g, '') + Crypto.randomUUID().replace(/-/g, '');

/**
 * SDK de los proveedores en el dispositivo (COPAYNI-91 §9 y §10). Necesita un **development
 * build**: en Expo Go no hay módulo nativo de Apple y la vuelta del navegador no llega a la app.
 *
 * Google se resuelve con `expo-auth-session`, el módulo de Expo, en vez de un SDK nativo de
 * terceros: la propia documentación de Expo avisa de que el SDK antiguo de Android está
 * descontinuado y de que su reemplazo (Credential Manager) va en la oferta de pago de esa
 * librería. El backend solo necesita un ID Token con nonce, que este flujo entrega igual.
 */
export class ExpoSocialSignIn implements SocialSignInPort {
  constructor(
    private readonly settings: SocialSignInSettings,
    /** Para el flujo web de Apple en Android, que lo coordina el backend. */
    private readonly http: HttpClientPort,
  ) {}

  async isAvailable(provider: SocialProvider): Promise<boolean> {
    if (provider === 'google') return this.settings.googleWebClientId.length > 0;
    // Apple nativo solo existe en iOS; en Android se ofrece por el navegador.
    if (Platform.OS !== 'ios') return true;
    return AppleAuthentication.isAvailableAsync();
  }

  signIn(provider: SocialProvider): Promise<SocialSignInResult> {
    if (provider === 'google') return this.google();
    return Platform.OS === 'ios' ? this.appleNative() : this.appleWeb();
  }

  /** Google: flujo de código con `response_type=id_token`, que es lo que el backend verifica. */
  private async google(): Promise<SocialSignInResult> {
    if (!this.settings.googleWebClientId) return { status: 'unsupported' };
    const nonce = newNonce();
    const request = new AuthRequest({
      clientId: this.settings.googleWebClientId,
      redirectUri: makeRedirectUri({ scheme: this.settings.scheme }),
      responseType: ResponseType.IdToken,
      scopes: ['openid', 'profile', 'email'],
      // Google devuelve el nonce tal cual en el token; así se ata a este intento.
      extraParams: { nonce },
    });

    const result: AuthSessionResult = await request.promptAsync({
      authorizationEndpoint: GOOGLE_AUTHORIZATION_ENDPOINT,
    });
    if (result.type !== 'success') return { status: 'cancelled' };
    const idToken = result.params.id_token;
    if (!idToken) return { status: 'cancelled' };
    return { status: 'credential', credential: { provider: 'google', idToken, nonce } };
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
   * Apple en Android: el backend abre el intento (guarda `state` y `nonce`), la persona autoriza
   * en el navegador y Apple vuelve al callback del backend, que redirige a la app con un código
   * interno de un solo uso. Por el deep link no viaja ningún token.
   */
  private async appleWeb(): Promise<SocialSignInResult> {
    const { authorizationUrl } = await this.http.post<{ authorizationUrl: string }>(
      '/auth/social/apple/authorize',
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

  isAvailable(provider: SocialProvider): Promise<boolean> {
    return Promise.resolve((this.state.available ?? ['google', 'apple']).includes(provider));
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
