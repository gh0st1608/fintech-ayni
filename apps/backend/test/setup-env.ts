/**
 * Variables de entorno de las pruebas. ConfigModule las valida al importar AppModule, así que
 * se fijan antes de cada archivo de pruebas. Límites bajos para probar rate limit, payload y timeout.
 */
export const TEST_ENV = {
  NODE_ENV: 'test',
  PORT: '3000',
  LOG_LEVEL: 'fatal',
  CORS_ALLOWED_ORIGINS: 'http://localhost:8081',
  REQUEST_TIMEOUT: '1000',
  BODY_LIMIT: '1kb',
  RATE_LIMIT_TTL: '60000',
  RATE_LIMIT_MAX: '5',
  ENABLE_SWAGGER: 'true',
  DEFAULT_CURRENCY: 'PEN',
  JOIN_PAYOUT_MIN: '300000',
  JOIN_PAYOUT_MAX: '12000000',
  JOIN_PAYOUT_STEP: '50000',
  SAVING_PROGRAM_MAX: '100000000',
} as const;

Object.assign(process.env, TEST_ENV);
