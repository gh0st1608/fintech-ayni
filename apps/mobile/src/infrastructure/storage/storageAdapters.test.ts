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

  it('sin Remember Me guarda la sesión solo en memoria y borra la persistida', async () => {
    await storage.save(AuthTokens.create({ accessToken: 'a1', refreshToken: 'r1' }));
    await storage.save(AuthTokens.create({ accessToken: 'a2', refreshToken: 'r2' }), {
      persist: false,
    });
    await expect(SecureStore.getItemAsync('auth.accessToken')).resolves.toBeNull();
    await expect(storage.read()).resolves.toMatchObject({ accessToken: 'a2' });
    // Otra instancia equivale a reabrir la app: no queda sesión.
    await expect(new SecureStoreTokenStorage().read()).resolves.toBeNull();
  });

  it('una renovación sin indicar el modo conserva la sesión en memoria', async () => {
    await storage.save(AuthTokens.create({ accessToken: 'a1', refreshToken: 'r1' }), {
      persist: false,
    });
    await storage.save(AuthTokens.create({ accessToken: 'a2', refreshToken: 'r2' }));
    await expect(storage.read()).resolves.toMatchObject({ accessToken: 'a2' });
    await expect(new SecureStoreTokenStorage().read()).resolves.toBeNull();
  });

  it('guardar con Remember Me reemplaza la sesión en memoria', async () => {
    await storage.save(AuthTokens.create({ accessToken: 'a1', refreshToken: 'r1' }), {
      persist: false,
    });
    await storage.save(AuthTokens.create({ accessToken: 'a2', refreshToken: 'r2' }), {
      persist: true,
    });
    await expect(new SecureStoreTokenStorage().read()).resolves.toMatchObject({
      accessToken: 'a2',
    });
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
