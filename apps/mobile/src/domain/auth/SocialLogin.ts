/**
 * Entrar con Google o Apple (COPAYNI-91). El proveedor autentica y entrega una credencial; la
 * sesión de Ayni la emite el backend. Los tokens del proveedor no se guardan nunca: solo viajan
 * una vez y se cambian por la sesión propia.
 */
export const SOCIAL_PROVIDERS = ['google', 'apple'] as const;
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];

/**
 * Lo que el backend puede ofrecer de cada proveedor en este ambiente. Lo decide el servidor:
 * activar o apagar un proveedor no exige publicar una versión nueva en las tiendas.
 */
export interface SocialProviderStatus {
  provider: SocialProvider;
  /** El SDK nativo del dispositivo sirve (Apple en iOS). */
  native: boolean;
  /** El flujo por navegador que coordina el backend está configurado. */
  web: boolean;
}

/** Lo que el SDK del proveedor entrega y el backend verifica. */
export interface SocialCredential {
  provider: SocialProvider;
  idToken: string;
  /** El valor aleatorio de este intento; el backend comprueba que el token lo lleve. */
  nonce: string;
}

/**
 * Cómo terminó el intento:
 * - `credential`: hay que canjearla por la sesión de Ayni.
 * - `session`: el proveedor pasó por el backend (Apple en Android) y la sesión ya está lista.
 * - `cancelled`: la persona cerró el diálogo; no es un error y no se le muestra nada.
 * - `unsupported`: ese proveedor no está disponible en este dispositivo o build.
 */
export type SocialSignInResult =
  | { status: 'credential'; credential: SocialCredential }
  | { status: 'session'; exchangeCode: string }
  | { status: 'cancelled' }
  | { status: 'unsupported' };

/**
 * Apple solo se ofrece donde se puede cumplir: en iOS es nativo y obligatorio si hay otro login
 * social; en Android pasa por el navegador contra el backend.
 */
export const isCancelled = (result: SocialSignInResult): boolean => result.status === 'cancelled';
