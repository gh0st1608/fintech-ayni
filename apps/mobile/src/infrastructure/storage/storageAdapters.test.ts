import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';

import { AsyncStorageLanguagePreference } from './AsyncStorageLanguagePreference';
import { SecureStoreTokenStorage } from './SecureStoreTokenStorage';

describe('SecureStoreTokenStorage', () => {
  const storage = new SecureStoreTokenStorage();

  beforeEach(() => storage.clear());

  it('guarda y recupera ambas credenciales en SecureStore', async () => {
    await storage.save(AuthTokens.create({ accessToken: 'a1', refreshToken: 'r1' }));
    await expect(SecureStore.getItemAsync('auth.accessToken')).resolves.toBe('a1');
    await expect(storage.read()).resolves.toMatchObject({ accessToken: 'a1', refreshToken: 'r1' });
  });

  it('devuelve null si falta alguna de las credenciales', async () => {
    await SecureStore.setItemAsync('auth.accessToken', 'a1');
    await expect(storage.read()).resolves.toBeNull();
  });

  it('clear elimina todas las credenciales', async () => {
    await storage.save(AuthTokens.create({ accessToken: 'a1', refreshToken: 'r1' }));
    await storage.clear();
    await expect(SecureStore.getItemAsync('auth.refreshToken')).resolves.toBeNull();
    await expect(storage.read()).resolves.toBeNull();
  });
});

describe('AsyncStorageLanguagePreference', () => {
  it('persiste la preferencia de idioma', async () => {
    await AsyncStorage.clear();
    const preference = new AsyncStorageLanguagePreference();
    await expect(preference.read()).resolves.toBeNull();
    await preference.save('en');
    await expect(preference.read()).resolves.toBe('en');
  });
});
