import * as SecureStore from 'expo-secure-store';

import type { TokenStoragePort } from '@/domain/auth/ports/TokenStoragePort';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';

const KEYS = {
  accessToken: 'auth.accessToken',
  refreshToken: 'auth.refreshToken',
} as const;

/** Credenciales en el almacén cifrado del sistema (Keychain / Keystore). */
export class SecureStoreTokenStorage implements TokenStoragePort {
  async read(): Promise<AuthTokens | null> {
    const [accessToken, refreshToken] = await Promise.all([
      SecureStore.getItemAsync(KEYS.accessToken),
      SecureStore.getItemAsync(KEYS.refreshToken),
    ]);
    if (!accessToken || !refreshToken) return null;
    return AuthTokens.create({ accessToken, refreshToken });
  }

  async save(tokens: AuthTokens): Promise<void> {
    await SecureStore.setItemAsync(KEYS.accessToken, tokens.accessToken);
    await SecureStore.setItemAsync(KEYS.refreshToken, tokens.refreshToken);
  }

  async clear(): Promise<void> {
    await Promise.all(Object.values(KEYS).map((key) => SecureStore.deleteItemAsync(key)));
  }
}
