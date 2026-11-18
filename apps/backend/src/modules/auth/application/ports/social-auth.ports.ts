import {
  type ExternalIdentity,
  type IdentityProvider,
  type VerifiedIdentity,
} from '../../domain/entities/external-identity';

export const IDENTITY_PROVIDERS_PORT = Symbol('IDENTITY_PROVIDERS_PORT');
export const EXTERNAL_IDENTITIES = Symbol('EXTERNAL_IDENTITIES');
export const SOCIAL_AUTH_FLOWS = Symbol('SOCIAL_AUTH_FLOWS');
export const SOCIAL_AUTH_SETTINGS = Symbol('SOCIAL_AUTH_SETTINGS');
export const APPLE_WEB_FLOW = Symbol('APPLE_WEB_FLOW');
export const GOOGLE_WEB_FLOW = Symbol('GOOGLE_WEB_FLOW');

export interface SocialAuthSettings {
  /** Cuánto vive un intento del flujo web: lo justo para ir al navegador y volver. */
  readonly flowTtlSeconds: number;
  /** Deep link al que vuelve la app con el código interno. Común a los dos proveedores. */
  readonly appRedirectUri: string;
  readonly apple: {
    /** `https://appleid.apple.com/auth/authorize`. */
    readonly authorizationUrl: string;
    /** Services ID: la audiencia del flujo web, distinta del bundle id de iOS. */
    readonly serviceId: string;
    /** Callback HTTPS registrado en Apple. */
    readonly redirectUri: string;
  };
  readonly google: {
    /** `https://accounts.google.com/o/oauth2/v2/auth`. */
    readonly authorizationUrl: string;
    /** Client ID **Web**: el único tipo al que Google admite un redirect HTTPS propio. */
    readonly clientId: string;
    /** Callback HTTPS registrado en Google Cloud Console. */
    readonly redirectUri: string;
  };
}

/**
 * Canje del `authorization code` con Apple (solo el flujo web de Android). Lo firma una clave
 * privada `.p8` que vive en el backend: nunca viaja al dispositivo.
 */
export interface AppleWebFlowPort {
  isConfigured(): boolean;
  /** Devuelve el `id_token` que Apple entrega a cambio del código. */
  exchange(code: string): Promise<string>;
}

/**
 * Canje del `authorization code` con Google. Google no admite esquemas propios (`ayni://`) ni el
 * flujo implícito en apps instaladas, así que el canje lo hace el backend con el client secret del
 * cliente Web, que nunca viaja al dispositivo, y con el `code_verifier` de PKCE del intento.
 */
export interface GoogleWebFlowPort {
  isConfigured(): boolean;
  /** Devuelve el `id_token` que Google entrega a cambio del código. */
  exchange(input: { code: string; codeVerifier: string }): Promise<string>;
}

/**
 * Verifica la credencial que entrega el proveedor (COPAYNI-91). Lanza `UnauthorizedError` si la
 * firma, el emisor, la audiencia, la vigencia o el nonce no cuadran: un token del proveedor nunca
 * se acepta sin comprobar su firma.
 */
export interface IdentityProviderPort {
  readonly provider: IdentityProvider;
  /** Si el proveedor tiene credenciales configuradas en este ambiente. */
  isConfigured(): boolean;
  /**
   * `nonce` es el valor que generó la app para este intento. Siempre se exige: sin él, un token
   * robado de otra sesión valdría.
   */
  verify(input: { idToken: string; nonce: string }): Promise<VerifiedIdentity>;
}

/** Catálogo de proveedores; resuelve el adaptador que corresponde. */
export interface IdentityProvidersPort {
  of(provider: IdentityProvider): IdentityProviderPort;
  /** Cuáles tienen credenciales en este ambiente. No lanza: es una consulta, no un uso. */
  configured(): readonly IdentityProvider[];
}

export interface ExternalIdentitiesPort {
  find(provider: IdentityProvider, subject: string): Promise<ExternalIdentity | null>;
  /** Las identidades de una persona, para mostrarlas y para no dejarla sin forma de entrar. */
  ofUser(userId: string): Promise<ExternalIdentity[]>;
  /**
   * Crea el usuario **y** su identidad en una sola transacción. Si otra petición ganó la carrera
   * (dos primeros inicios a la vez), devuelve la identidad que ya existe en vez de duplicar.
   */
  registerWithUser(input: {
    identity: VerifiedIdentity;
    email: string | null;
    at: Date;
  }): Promise<ExternalIdentity>;
  /** Vincula un proveedor a una cuenta ya autenticada. */
  link(userId: string, identity: VerifiedIdentity, at: Date): Promise<ExternalIdentity>;
  /** Desvincula; `false` si no estaba vinculada. */
  unlink(userId: string, provider: IdentityProvider): Promise<boolean>;
  touch(id: string, at: Date): Promise<void>;
}

/**
 * Estado del flujo web de Apple en Android (COPAYNI-91 §9). Guarda `state` y `nonce` del intento y
 * el código interno de un solo uso con el que la app canjea su sesión: por el deep link nunca
 * viajan tokens.
 */
export interface SocialAuthFlow {
  state: string;
  nonce: string;
  provider: IdentityProvider;
  expiresAt: Date;
  /** Se completa cuando el proveedor responde; hasta entonces no hay nada que canjear. */
  userId: string | null;
  exchangeCodeHash: string | null;
  consumedAt: Date | null;
  /** `code_verifier` de PKCE; solo lo usa Google. Nulo en los intentos de Apple. */
  codeVerifier: string | null;
}

export interface SocialAuthFlowsPort {
  create(flow: Omit<SocialAuthFlow, 'userId' | 'exchangeCodeHash' | 'consumedAt'>): Promise<void>;
  /** Consume el `state`: solo el primer callback de ese intento vale. */
  consumeState(state: string, now: Date): Promise<SocialAuthFlow | null>;
  /** Deja el intento listo para canjear por el código interno. */
  attachExchangeCode(state: string, userId: string, codeHash: string): Promise<void>;
  /** Canjea el código interno una sola vez. */
  consumeExchangeCode(codeHash: string, now: Date): Promise<SocialAuthFlow | null>;
}
