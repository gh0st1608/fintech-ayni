import { isSpanContextValid, trace } from '@opentelemetry/api';
import { type DestinationStream, type Logger, pino } from 'pino';

import { type EnvironmentVariables } from '../../../config/env.validation';

export type LoggerSettings = Pick<
  EnvironmentVariables,
  'APP_NAME' | 'APP_VERSION' | 'DEPLOYMENT_ENVIRONMENT' | 'LOG_LEVEL'
>;

export const REDACTED = '[REDACTED]';

/** Campos que nunca se escriben: credenciales, OTP, documentos de identidad y datos de tarjeta. */
const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'apiKey',
  'secret',
  'otp',
  'otpCode',
  'pin',
  'documentNumber',
  'cardNumber',
  'pan',
  'cvv',
  'cvc',
];

/** Rutas de pino: el campo en la raíz y hasta tres niveles de anidamiento. */
export const REDACT_PATHS = SENSITIVE_KEYS.flatMap((key) => [
  key,
  `*.${key}`,
  `*.*.${key}`,
  `*.*.*.${key}`,
]);

/** Trace y span activos, si los hay. Con ellos se correlacionan logs y trazas en New Relic. */
export function currentTraceIds(): { traceId: string; spanId: string } | undefined {
  const spanContext = trace.getActiveSpan()?.spanContext();
  return spanContext && isSpanContextValid(spanContext)
    ? { traceId: spanContext.traceId, spanId: spanContext.spanId }
    : undefined;
}

/**
 * Logger JSON (una línea por evento) con nivel como texto, fecha ISO, servicio, versión y
 * ambiente. Cada línea emitida dentro de una traza lleva `traceId` y `spanId`.
 */
export function createLogger(settings: LoggerSettings, destination?: DestinationStream): Logger {
  return pino(
    {
      level: settings.LOG_LEVEL,
      base: {
        service: settings.APP_NAME,
        version: settings.APP_VERSION,
        env: settings.DEPLOYMENT_ENVIRONMENT,
      },
      messageKey: 'message',
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: { level: (label) => ({ level: label }) },
      mixin: () => currentTraceIds() ?? {},
      redact: { paths: REDACT_PATHS, censor: REDACTED },
    },
    destination,
  );
}
