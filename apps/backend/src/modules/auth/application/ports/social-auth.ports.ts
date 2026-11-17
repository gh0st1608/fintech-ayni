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

export interface SocialAuthSettings {
  /** Cuánto vive un intento del flujo web: lo justo para ir al navegador y volver. */
  readonly flowTtlSeconds: number;
  readonly apple: {
    /** `https://appleid.apple.com/auth/authorize`. */
    readonly authorizationUrl: string;
    /** Services ID: la audiencia del flujo web, distinta del bundle id de iOS. */
    readonly serviceId: string;
    /** Callback HTTPS registrado en Apple. */
    readonly redirectUri: string;
    /** Deep link al que vuelve la app con el código interno. */
    readonly appRedirectUri: string;
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
