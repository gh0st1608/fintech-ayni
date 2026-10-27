import { validateEnvironment } from '@src/config/env.validation';

const REQUIRED = {
  DEFAULT_CURRENCY: 'PEN',
  JOIN_PAYOUT_MIN: '300000',
  JOIN_PAYOUT_MAX: '12000000',
  JOIN_PAYOUT_STEP: '50000',
  SAVING_PROGRAM_MAX: '100000000',
};

describe('validateEnvironment', () => {
  it('aplica los valores por defecto y convierte los tipos', () => {
    const env = validateEnvironment({ ...REQUIRED, PATH: '/usr/bin' });

    expect(env).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      CORS_ALLOWED_ORIGINS: [],
      TRUST_PROXY: false,
      REQUEST_TIMEOUT: 30000,
      BODY_LIMIT: '100kb',
      ENABLE_SWAGGER: false,
      JOIN_PAYOUT_MIN: 300000,
    });
  });

  it('interpreta booleanos y listas desde el texto original', () => {
    const env = validateEnvironment({
      ...REQUIRED,
      PORT: '8080',
      TRUST_PROXY: 'true',
      ENABLE_SWAGGER: 'false',
      CORS_ALLOWED_ORIGINS: 'https://ayni.pe, http://localhost:8081',
    });

    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.ENABLE_SWAGGER).toBe(false);
    expect(env.CORS_ALLOWED_ORIGINS).toEqual(['https://ayni.pe', 'http://localhost:8081']);
  });

  it('falla nombrando cada variable inválida, sin mostrar su valor', () => {
    const secret = 'valor-secreto-no-imprimir';
    const validate = () =>
      validateEnvironment({
        ...REQUIRED,
        PORT: '70000',
        ENABLE_SWAGGER: secret,
        CORS_ALLOWED_ORIGINS: 'no-es-una-url',
        DEFAULT_CURRENCY: undefined,
      });

    expect(validate).toThrow(/Configuración inválida/);
    expect(validate).toThrow(/PORT/);
    expect(validate).toThrow(/ENABLE_SWAGGER/);
    expect(validate).toThrow(/CORS_ALLOWED_ORIGINS/);
    expect(validate).toThrow(/DEFAULT_CURRENCY debe ser un código ISO 4217/);
    expect(validate).not.toThrow(new RegExp(secret));
  });

  it('exige los montos de unión a un círculo', () => {
    expect(() => validateEnvironment({ DEFAULT_CURRENCY: 'PEN' })).toThrow(
      /JOIN_PAYOUT_MIN[\s\S]*JOIN_PAYOUT_MAX[\s\S]*JOIN_PAYOUT_STEP[\s\S]*SAVING_PROGRAM_MAX/,
    );
  });
});
