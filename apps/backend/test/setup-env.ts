/**
 * Variables de entorno de las pruebas. ConfigModule las valida al importar AppModule, así que
 * se fijan antes de cada archivo de pruebas. Límites bajos para probar rate limit, payload y timeout.
 */
export const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'fatal',
  CORS_ALLOWED_ORIGINS: 'http://localhost:8081',
  // Holgado: con la suite en paralelo y cobertura, una unión real puede pasar 1 s.
  REQUEST_TIMEOUT: '5000',
  BODY_LIMIT: '1kb',
  RATE_LIMIT_TTL: '60000',
  RATE_LIMIT_MAX: '5',
  // El tope de /admin se agrega para toda la API de administración (COPAYNI-74). Las e2e que
  // hacen muchas llamadas de administración lo suben con high-rate-limit.ts.
  ADMIN_RATE_LIMIT_TTL: '60000',
  ADMIN_RATE_LIMIT_MAX: '2',
  ENABLE_SWAGGER: 'true',
  DEFAULT_CURRENCY: 'PEN',
  // PEN oficial y USD habilitada con un tipo de cambio fijo (pending-scope M2 y M6).
  SUPPORTED_CURRENCIES: 'PEN,USD',
  EXCHANGE_RATES: 'USD:3.75',
  // Pasarela simulada (COPAYNI-34): las pruebas nunca llaman a Mercado Pago.
  PAYMENT_GATEWAY: 'fake',
  JOIN_PAYOUT_MIN: '300000',
  JOIN_PAYOUT_MAX: '12000000',
  JOIN_PAYOUT_STEP: '50000',
  // Las pruebas ejercitan la regla de confianza, no su valor de lanzamiento: en producción arranca
  // en 0 porque nadie tiene círculos completados todavía (pending-scope §3.2, P10).
  TRUST_FASTEST_MIN_COMPLETED_CIRCLES: '1',
  SAVING_PROGRAM_MAX: '100000000',
  CIRCLE_DURATION_OPTIONS: '6,10,12',
  // PostgreSQL de compose.yaml (npm run db:up) o el service de CI. Credenciales solo de prueba.
  DB_HOST: '127.0.0.1',
  DB_PORT: '5432',
  DB_NAME: 'ayni_test',
  DB_USERNAME: 'ayni',
  DB_PASSWORD: 'ayni',
  DB_POOL_MAX: '5',
  // Sin proveedor de OTP (T6): las pruebas usan el código fijo de desarrollo. La clave JWT y el
  // secreto de los OTP se generan al arrancar.
  OTP_DEV_CODE: '1234',
  // Flujo web de Google (COPAYNI-91 §9): credenciales de mentira; el canje se reemplaza por un
  // doble en las pruebas, así que nunca se sale a Google.
  GOOGLE_WEB_CLIENT_ID: '123-de-prueba.apps.googleusercontent.com',
  GOOGLE_REDIRECT_URI: 'https://api.ayni.test/v1/auth/social/google/callback',
} as const;

Object.assign(process.env, TEST_ENV);

/**
 * floci, el emulador de AWS (infra/local/compose.yaml; en CI, un service): las pruebas del SDK de
 * AWS van contra él, nunca contra una cuenta real. Credenciales ficticias que floci acepta.
 */
export const FLOCI_ENDPOINT = process.env.FLOCI_ENDPOINT ?? 'http://127.0.0.1:4566';
// Sin el perfil de la máquina: el SDK lo preferiría y firmaría con credenciales reales.
delete process.env.AWS_PROFILE;
Object.assign(process.env, { AWS_ACCESS_KEY_ID: 'test', AWS_SECRET_ACCESS_KEY: 'test' });
