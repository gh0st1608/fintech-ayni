import { createTestContainer } from '@test/fakes/createTestContainer';

import { loadEnv, parseEnv } from './env';

describe('parseEnv', () => {
  it('aplica valores por defecto cuando solo se define la URL de la API', () => {
    expect(parseEnv({ apiUrl: 'https://api.example.com/v1' })).toEqual({
      appEnv: 'dev',
      apiUrl: 'https://api.example.com/v1',
      defaultLanguage: 'es',
      defaultCurrency: 'PEN',
      httpTimeoutMs: 15000,
    });
  });

  it('convierte el timeout a número', () => {
    expect(parseEnv({ apiUrl: 'https://a.io', httpTimeoutMs: '5000' }).httpTimeoutMs).toBe(5000);
  });

  it('falla nombrando las variables inválidas sin mostrar sus valores', () => {
    const invalid = () => parseEnv({ apiUrl: 'no-es-url', defaultCurrency: 'soles' });
    expect(invalid).toThrow(/Invalid configuration: apiUrl, defaultCurrency/);
    expect(invalid).not.toThrow(/no-es-url|soles/);
  });

  it('loadEnv lee las variables EXPO_PUBLIC_*', () => {
    expect(loadEnv()).toMatchObject({
      apiUrl: 'https://api.test.local/v1',
      defaultCurrency: 'PEN',
    });
  });
});

describe('createContainer', () => {
  it('conecta los casos de uso con los adaptadores recibidos', async () => {
    const { container, adapters } = createTestContainer();

    await container.auth.signIn.execute({ accessToken: 'a1', refreshToken: 'r1' });
    expect(adapters.tokenStorage.tokens).not.toBeNull();
    await expect(container.auth.restoreSession.execute()).resolves.toBe('authenticated');

    await container.i18n.changeLanguage.execute('en');
    expect(adapters.languagePreference.stored).toBe('en');
    await expect(container.i18n.resolveLanguage.execute()).resolves.toBe('en');
  });

  it('expone el ambiente configurado a la presentación', () => {
    expect(createTestContainer().container.config.environment).toBe('dev');
  });
});
