import type { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';

import type { SocialCredential, SocialProvider, SocialSignInResult } from '../SocialLogin';

/**
 * El SDK del proveedor en el dispositivo (COPAYNI-91 §9). Vive detrás de un puerto porque exige
 * un development build: en las pruebas y en el modo fake se usa un doble.
 */
export interface SocialSignInPort {
  /** Si se puede ofrecer aquí: Apple nativo solo en iOS, y nada sin configuración del proveedor. */
  isAvailable(provider: SocialProvider): Promise<boolean>;
  /** Abre el diálogo del proveedor. Cancelar no es un error. */
  signIn(provider: SocialProvider): Promise<SocialSignInResult>;
}

/** Login social contra el backend (contrato en docs/api/social-auth.md). */
export interface SocialAuthApiPort {
  /** Canjea la credencial del proveedor por la sesión de Ayni. */
  login(credential: SocialCredential, signal?: AbortSignal): Promise<AuthTokens>;
  /** Canjea el código interno del flujo web de Apple en Android. */
  exchange(code: string, signal?: AbortSignal): Promise<AuthTokens>;
  /** Vincula el proveedor a la cuenta con sesión iniciada. */
  link(credential: SocialCredential): Promise<void>;
  unlink(provider: SocialProvider): Promise<void>;
  /** Proveedores vinculados, para mostrarlos en el perfil. */
  list(signal?: AbortSignal): Promise<SocialProvider[]>;
}
