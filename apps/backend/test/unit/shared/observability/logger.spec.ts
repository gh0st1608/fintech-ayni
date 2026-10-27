import { Writable } from 'node:stream';

import { trace } from '@opentelemetry/api';

import { createLogger, REDACTED } from '@src/shared/infrastructure/observability/logger';
import { startTelemetry, type Telemetry } from '@src/shared/infrastructure/observability/telemetry';

const SETTINGS = {
  APP_NAME: 'ayni-api',
  APP_VERSION: '1.2.3',
  DEPLOYMENT_ENVIRONMENT: 'dev',
  LOG_LEVEL: 'info',
} as const;

/** Captura las líneas JSON que escribe el logger. */
function capture(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const lines = (): Record<string, unknown>[] =>
    chunks
      .join('')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as Record<string, unknown>);
  return { stream, lines };
}

describe('createLogger', () => {
  it('escribe JSON con nivel, fecha ISO, servicio, versión y ambiente', () => {
    const { stream, lines } = capture();
    createLogger(SETTINGS, stream).info({ context: 'Test' }, 'hola');

    expect(lines()[0]).toEqual({
      level: 'info',
      time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      service: 'ayni-api',
      version: '1.2.3',
      env: 'dev',
      context: 'Test',
      message: 'hola',
    });
  });

  it('respeta LOG_LEVEL', () => {
    const { stream, lines } = capture();
    const logger = createLogger({ ...SETTINGS, LOG_LEVEL: 'warn' }, stream);
    logger.info('no');
    logger.warn('si');

    expect(lines().map((line) => line.message)).toEqual(['si']);
  });

  it('redacta credenciales, OTP, documentos y datos de tarjeta, también anidados', () => {
    const { stream, lines } = capture();
    createLogger(SETTINGS, stream).info({
      authorization: 'Bearer abc',
      otp: '123456',
      request: { headers: { authorization: 'Bearer abc', cookie: 'sid=1' } },
      user: { documentNumber: '12345678', email: 'ana@ayni.pe' },
      payment: { card: { cardNumber: '4111111111111111', cvv: '987' } },
      session: { accessToken: 'tok-a', refreshToken: 'tok-r' },
    });

    const line = JSON.stringify(lines()[0]);
    for (const secret of [
      'Bearer abc',
      '123456',
      'sid=1',
      '12345678',
      '4111111111111111',
      '987',
      'tok-',
    ]) {
      expect(line).not.toContain(secret);
    }
    expect(lines()[0]).toMatchObject({
      authorization: REDACTED,
      user: { documentNumber: REDACTED, email: 'ana@ayni.pe' },
      payment: { card: { cardNumber: REDACTED, cvv: REDACTED } },
    });
  });

  describe('dentro de una traza', () => {
    let telemetry: Telemetry;

    beforeAll(() => {
      telemetry = startTelemetry({
        ...SETTINGS,
        LOG_LEVEL: 'fatal',
        ENABLE_TRACING: false,
        ENABLE_METRICS: false,
        ENABLE_LOGGING: false,
      });
    });

    afterAll(() => telemetry.shutdown());

    it('agrega traceId y spanId del span activo', () => {
      const { stream, lines } = capture();
      const logger = createLogger(SETTINGS, stream);

      const ids = trace.getTracer('test').startActiveSpan('operacion', (span) => {
        logger.info('dentro');
        span.end();
        return span.spanContext();
      });
      logger.info('fuera');

      const [inside, outside] = lines();
      expect(inside).toMatchObject({ traceId: ids.traceId, spanId: ids.spanId });
      expect(outside).not.toHaveProperty('traceId');
    });
  });
});
