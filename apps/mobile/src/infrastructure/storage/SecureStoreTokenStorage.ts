import * as SecureStore from 'expo-secure-store';

import type { SaveTokensOptions, TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';

const KEYS = {
  accessToken: 'auth.accessToken',
  refreshToken: 'auth.refreshToken',
} as const;

/**
 * Credenciales en el almacén cifrado del sistema (Keychain / Keystore). Sin "Remember Me"
 * quedan solo en memoria: la sesión termina al cerrar la app y nada queda en el dispositivo.
 */
export class SecureStoreTokenStorage implements TokenStoragePort {
  private volatile: AuthTokens | null = null;

  async read(): Promise<AuthTokens | null> {
    if (this.volatile) return this.volatile;
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(KEYS.accessToken),
      SecureStore.getItemAsync(KEYS.refreshToken),
    ]);
    if (!accessToken || !refreshToken) return null;
    return AuthTokens.create({ accessToken, refreshToken });
  }

  async save(tokens: AuthTokens, options: SaveTokensOptions = {}): Promise<void> {
    const persist = options.persist ?? this.volatile === null;
    if (!persist) {
      await this.deletePersisted();
      this.volatile = tokens;
      return;
    }
    this.volatile = null;
    await SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken);
    await SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken);
  }

  async clear(): Promise<void> {
    this.volatile = null;
    await this.deletePersisted();
  }

  private async deletePersisted(): Promise<void> {
    await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)));
  }
}
