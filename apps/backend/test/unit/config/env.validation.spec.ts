import { validateEnvironment } from '@src/config/env.validation';

const REQUIRED = {
  DEFAULT_CURRENCY: 'PEN',
  JOIN_PAYOUT_MIN: '300000',
  JOIN_PAYOUT_MAX: '12000000',
  JOIN_PAYOUT_STEP: '50000',
  SAVING_PROGRAM_MAX: '100000000',
  CIRCLE_DURATION_OPTIONS: '6,10,12',
  DB_HOST: 'localhost',
  DB_NAME: 'ayni',
  DB_USERNAME: 'ayni',
  DB_PASSWORD: 'secreto',
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

  describe('observabilidad', () => {
    it('no exporta nada por defecto y no exige endpoint', () => {
      expect(validateEnvironment(REQUIRED)).toMatchObject({
        DEPLOYMENT_ENVIRONMENT: 'local',
        ENABLE_TRACING: false,
        ENABLE_METRICS: false,
        ENABLE_LOGGING: false,
      });
    });

    it.each(['ENABLE_TRACING', 'ENABLE_METRICS', 'ENABLE_LOGGING'])(
      'exige OTEL_EXPORTER_OTLP_ENDPOINT si %s=true',
      (flag) => {
        expect(() => validateEnvironment({ ...REQUIRED, [flag]: 'true' })).toThrow(
          /OTEL_EXPORTER_OTLP_ENDPOINT/,
        );
        expect(
          validateEnvironment({
            ...REQUIRED,
            [flag]: 'true',
            OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.com:4318',
          }),
        ).toMatchObject({ [flag]: true });
      },
    );

    it('rechaza un ambiente inválido, un endpoint sin http(s) y una license key vacía', () => {
      expect(() =>
        validateEnvironment({
          ...REQUIRED,
          ENABLE_TRACING: 'true',
          OTEL_EXPORTER_OTLP_ENDPOINT: 'grpc://collector:4317',
          DEPLOYMENT_ENVIRONMENT: 'Producción',
          NEW_RELIC_LICENSE_KEY: '',
        }),
      ).toThrow(
        /DEPLOYMENT_ENVIRONMENT[\s\S]*OTEL_EXPORTER_OTLP_ENDPOINT[\s\S]*NEW_RELIC_LICENSE_KEY/,
      );
    });

    it('nunca muestra la license key en el error', () => {
      expect(() =>
        validateEnvironment({
          ...REQUIRED,
          ENABLE_TRACING: 'yes',
          NEW_RELIC_LICENSE_KEY: 'secreta-123',
        }),
      ).toThrow(expect.objectContaining({ message: expect.not.stringContaining('secreta-123') }));
    });
  });

  describe('CIRCLE_DURATION_OPTIONS', () => {
    it('convierte la lista en enteros', () => {
      expect(
        validateEnvironment({ ...REQUIRED, CIRCLE_DURATION_OPTIONS: '6, 12,24' })
          .CIRCLE_DURATION_OPTIONS,
      ).toEqual([6, 12, 24]);
    });

    it.each([
      ['vacía', ''],
      ['con texto', '6,doce'],
      ['con 1 mes', '1,6'],
      ['con repetidos', '6,6'],
      ['con decimales', '6.5'],
    ])('rechaza una lista %s', (_case, value) => {
      expect(() => validateEnvironment({ ...REQUIRED, CIRCLE_DURATION_OPTIONS: value })).toThrow(
        /CIRCLE_DURATION_OPTIONS/,
      );
    });
  });
  describe('base de datos', () => {
    it('aplica los valores por defecto de puerto, TLS y pool', () => {
      expect(validateEnvironment({ ...REQUIRED })).toMatchObject({
        DB_PORT: 5432,
        DB_SSL: false,
        DB_POOL_MAX: 10,
      });
    });

    it.each(['DB_HOST', 'DB_NAME', 'DB_USERNAME', 'DB_PASSWORD'])('exige %s', (key) => {
      expect(() => validateEnvironment({ ...REQUIRED, [key]: '' })).toThrow(new RegExp(key));
    });

    it('nunca incluye la contraseña en el mensaje de error', () => {
      expect(() => validateEnvironment({ ...REQUIRED, DB_PORT: 'x' })).not.toThrow(/secreto/);
    });
  });
  describe('autenticación', () => {
    const PRODUCTION = {
      ...REQUIRED,
      NODE_ENV: 'production',
      JWT_PRIVATE_KEY: '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----',
      OTP_PEPPER: 'p'.repeat(32),
    };

    it('fuera de production no exige la clave JWT ni el secreto de los OTP', () => {
      expect(validateEnvironment({ ...REQUIRED })).toMatchObject({
        JWT_KEY_ID: 'ayni-1',
        ACCESS_TOKEN_TTL_SECONDS: 900,
        REFRESH_TOKEN_TTL_DAYS: 30,
        OTP_CODE_TTL_SECONDS: 300,
        OTP_RESEND_COOLDOWN_SECONDS: 30,
        OTP_MAX_ATTEMPTS: 5,
      });
    });

    it('en production los exige', () => {
      expect(() => validateEnvironment(PRODUCTION)).not.toThrow();
      expect(() => validateEnvironment({ ...PRODUCTION, JWT_PRIVATE_KEY: undefined })).toThrow(
        /JWT_PRIVATE_KEY/,
      );
      expect(() => validateEnvironment({ ...PRODUCTION, OTP_PEPPER: 'corto' })).toThrow(
        /OTP_PEPPER/,
      );
    });

    it('rechaza una clave que no es PEM', () => {
      expect(() => validateEnvironment({ ...REQUIRED, JWT_PRIVATE_KEY: 'clave' })).toThrow(
        /JWT_PRIVATE_KEY/,
      );
    });

    it('OTP_DEV_CODE tiene 4 dígitos y nunca se admite en production', () => {
      expect(validateEnvironment({ ...REQUIRED, OTP_DEV_CODE: '1234' }).OTP_DEV_CODE).toBe('1234');
      expect(() => validateEnvironment({ ...REQUIRED, OTP_DEV_CODE: '12' })).toThrow(
        /OTP_DEV_CODE/,
      );
      expect(() => validateEnvironment({ ...PRODUCTION, OTP_DEV_CODE: '1234' })).toThrow(
        /OTP_DEV_CODE: no se admite en production/,
      );
    });

    it('los pagos simulados del ciclo mensual nunca se admiten en production (COPAYNI-56)', () => {
      expect(validateEnvironment({ ...REQUIRED, CIRCLE_PAYMENTS_ADAPTER: 'fake' })).toMatchObject({
        CIRCLE_PAYMENTS_ADAPTER: 'fake',
        CIRCLE_INSTALLMENT_DUE_DAY: 1,
      });
      expect(validateEnvironment(PRODUCTION).CIRCLE_PAYMENTS_ADAPTER).toBeUndefined();
      expect(() => validateEnvironment({ ...PRODUCTION, CIRCLE_PAYMENTS_ADAPTER: 'fake' })).toThrow(
        /CIRCLE_PAYMENTS_ADAPTER: fake no se admite en production/,
      );
      expect(() => validateEnvironment({ ...REQUIRED, CIRCLE_PAYMENTS_ADAPTER: 'stripe' })).toThrow(
        /CIRCLE_PAYMENTS_ADAPTER/,
      );
      expect(() => validateEnvironment({ ...REQUIRED, CIRCLE_INSTALLMENT_DUE_DAY: '29' })).toThrow(
        /CIRCLE_INSTALLMENT_DUE_DAY/,
      );
    });

    it('trae las reglas de impago del PO y no admite una penalidad de devolución menor a 5 % (COPAYNI-57)', () => {
      expect(validateEnvironment({ ...REQUIRED })).toMatchObject({
        DELINQUENCY_GRACE_DAYS: 3,
        LATE_FEE_BPS: 300,
        EXPULSION_REFUND_PENALTY_BPS: 500,
      });
      expect(() =>
        validateEnvironment({ ...REQUIRED, EXPULSION_REFUND_PENALTY_BPS: '499' }),
      ).toThrow(/EXPULSION_REFUND_PENALTY_BPS/);
      expect(() => validateEnvironment({ ...REQUIRED, LATE_FEE_BPS: '10001' })).toThrow(
        /LATE_FEE_BPS/,
      );
      expect(() => validateEnvironment({ ...REQUIRED, DELINQUENCY_GRACE_DAYS: '-1' })).toThrow(
        /DELINQUENCY_GRACE_DAYS/,
      );
    });

    it('trae los valores propuestos del fondo de garantía (COPAYNI-58)', () => {
      expect(validateEnvironment({ ...REQUIRED })).toMatchObject({
        GUARANTEE_FUND_FEE_SHARE_BPS: 2500,
        GUARANTEE_FUND_MIN_INSTALLMENTS_PER_CIRCLE: 2,
      });
      expect(() =>
        validateEnvironment({ ...REQUIRED, GUARANTEE_FUND_FEE_SHARE_BPS: '10001' }),
      ).toThrow(/GUARANTEE_FUND_FEE_SHARE_BPS/);
      expect(() =>
        validateEnvironment({ ...REQUIRED, GUARANTEE_FUND_MIN_INSTALLMENTS_PER_CIRCLE: '13' }),
      ).toThrow(/GUARANTEE_FUND_MIN_INSTALLMENTS_PER_CIRCLE/);
    });

    it('trae los valores propuestos de la regla de confianza y la retención (COPAYNI-60)', () => {
      expect(validateEnvironment({ ...REQUIRED })).toMatchObject({
        TRUST_FASTEST_MIN_COMPLETED_CIRCLES: 1,
        PAYOUT_RETENTION_INSTALLMENTS: 2,
      });
      expect(() =>
        validateEnvironment({ ...REQUIRED, PAYOUT_RETENTION_INSTALLMENTS: '13' }),
      ).toThrow(/PAYOUT_RETENTION_INSTALLMENTS/);
      expect(() =>
        validateEnvironment({ ...REQUIRED, TRUST_FASTEST_MIN_COMPLETED_CIRCLES: '-1' }),
      ).toThrow(/TRUST_FASTEST_MIN_COMPLETED_CIRCLES/);
    });

    it('pide una autenticación reciente del personal para pausar (COPAYNI-61)', () => {
      expect(validateEnvironment({ ...REQUIRED })).toMatchObject({
        STAFF_STEP_UP_MAX_AGE_SECONDS: 300,
      });
      expect(() =>
        validateEnvironment({ ...REQUIRED, STAFF_STEP_UP_MAX_AGE_SECONDS: '30' }),
      ).toThrow(/STAFF_STEP_UP_MAX_AGE_SECONDS/);
    });
  });

  describe('métodos de cobro', () => {
    it('trae el catálogo provisional por defecto', () => {
      expect(validateEnvironment({ ...REQUIRED })).toMatchObject({
        PAYOUT_METHODS: ['digital_wallet', 'prepaid_card', 'bank_transfer'],
        PAYOUT_METHODS_UNAVAILABLE: [],
        PAYOUT_METHODS_NO_CHARGE: ['prepaid_card', 'bank_transfer'],
        PAYOUT_PREPAID_CARD_LIMIT: 10_000_000,
      });
    });

    it('rechaza métodos desconocidos', () => {
      expect(() => validateEnvironment({ ...REQUIRED, PAYOUT_METHODS: 'cheque' })).toThrow(
        /PAYOUT_METHODS/,
      );
      expect(() => validateEnvironment({ ...REQUIRED, PAYOUT_METHODS: '' })).toThrow(
        /PAYOUT_METHODS/,
      );
    });
  });

  describe('elegibilidad para unirse', () => {
    it('por defecto asume el National ID y no limita el pay-in mensual', () => {
      expect(validateEnvironment({ ...REQUIRED })).toMatchObject({
        JOIN_IDENTITY_CHECK: 'assume_verified',
        JOIN_MONTHLY_PAYIN_LIMIT: 0,
      });
      expect(
        validateEnvironment({
          ...REQUIRED,
          JOIN_IDENTITY_CHECK: 'assume_unverified',
          JOIN_MONTHLY_PAYIN_LIMIT: '500000',
        }),
      ).toMatchObject({
        JOIN_IDENTITY_CHECK: 'assume_unverified',
        JOIN_MONTHLY_PAYIN_LIMIT: 500_000,
      });
    });

    it('rechaza valores fuera del contrato', () => {
      expect(() => validateEnvironment({ ...REQUIRED, JOIN_IDENTITY_CHECK: 'kyc' })).toThrow(
        /JOIN_IDENTITY_CHECK/,
      );
      expect(() => validateEnvironment({ ...REQUIRED, JOIN_MONTHLY_PAYIN_LIMIT: '-1' })).toThrow(
        /JOIN_MONTHLY_PAYIN_LIMIT/,
      );
    });
  });
});
