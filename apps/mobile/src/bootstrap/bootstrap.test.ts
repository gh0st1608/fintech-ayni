import { FAKE_OTP_CODE } from '@/infrastructure/auth/InMemoryAuthApi';
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
      authApi: 'http',
      circlesApi: 'http',
      profileApi: 'http',
      payoutsApi: 'http',
      paymentsApi: 'http',
      paymentTokenizer: 'unconfigured',
      documentsApi: 'http',
    });
  });

  it.each([
    'authApi',
    'circlesApi',
    'profileApi',
    'payoutsApi',
    'paymentsApi',
    'documentsApi',
  ] as const)('solo admite %s falsa en dev', (key) => {
    const base = { apiUrl: 'https://api.example.com/v1', [key]: 'fake' };
    expect(parseEnv({ ...base, appEnv: 'dev' })[key]).toBe('fake');
    expect(() => parseEnv({ ...base, appEnv: 'prod' })).toThrow(new RegExp(key));
  });

  it('los enlaces legales deben ser https; vacíos cuentan como no definidos', () => {
    const base = { apiUrl: 'https://api.example.com/v1' };
    expect(parseEnv({ ...base, termsUrl: '' }).termsUrl).toBeUndefined();
    expect(parseEnv({ ...base, privacyUrl: 'https://ayni.pe/privacy' }).privacyUrl).toBe(
      'https://ayni.pe/privacy',
    );
    expect(() => parseEnv({ ...base, termsUrl: 'http://ayni.pe/terms' })).toThrow(/termsUrl/);
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

    const challenge = await container.auth.startAuthentication.execute('ana@mail.com');
    await container.auth.verifyOtp.execute({
      challengeId: challenge.challengeId,
      code: FAKE_OTP_CODE,
      rememberMe: true,
    });
    expect(adapters.tokenStorage.tokens).not.toBeNull();
    await expect(container.auth.restoreSession.execute()).resolves.toBe('authenticated');

    await container.i18n.changeLanguage.execute('en');
    expect(adapters.languagePreference.stored).toBe('en');
    await expect(container.i18n.resolveLanguage.execute()).resolves.toBe('en');
  });

  it('expone el ambiente configurado a la presentación', () => {
    expect(createTestContainer().container.config.environment).toBe('dev');
  });

  it('la pasarela simulada solo se admite en dev', () => {
    const base = { apiUrl: 'https://api.example.com/v1', paymentTokenizer: 'fake' };
    expect(parseEnv({ ...base, appEnv: 'dev' }).paymentTokenizer).toBe('fake');
    expect(() => parseEnv({ ...base, appEnv: 'prod' })).toThrow();
  });
});
