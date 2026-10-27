import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import { type AddressInfo } from 'node:net';
import { gunzipSync } from 'node:zlib';

import { metrics, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';

import {
  activeTelemetry,
  buildResource,
  createInstrumentations,
  exporterOptions,
  HEALTH_PATH,
  startTelemetry,
  type TelemetrySettings,
} from '@src/shared/infrastructure/observability/telemetry';
import { TelemetryShutdown } from '@src/shared/infrastructure/observability/telemetry-shutdown';

interface Export {
  path: string;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

const LICENSE_KEY = 'clave-de-prueba';

const settings = (overrides: Partial<TelemetrySettings> = {}): TelemetrySettings => ({
  APP_NAME: 'ayni-api',
  APP_VERSION: '1.2.3',
  DEPLOYMENT_ENVIRONMENT: 'dev',
  LOG_LEVEL: 'fatal',
  ENABLE_TRACING: false,
  ENABLE_METRICS: false,
  ENABLE_LOGGING: false,
  ...overrides,
});

describe('telemetría', () => {
  describe('configuración', () => {
    it('identifica servicio, versión y ambiente en el resource', () => {
      expect(buildResource(settings()).attributes).toMatchObject({
        'service.name': 'ayni-api',
        'service.version': '1.2.3',
        'deployment.environment.name': 'dev',
      });
    });

    it('arma la URL por señal y agrega api-key solo si hay license key', () => {
      expect(
        exporterOptions(
          settings({
            OTEL_EXPORTER_OTLP_ENDPOINT: 'https://otlp.example.com:4318/',
            NEW_RELIC_LICENSE_KEY: LICENSE_KEY,
          }),
          'traces',
        ),
      ).toEqual({
        url: 'https://otlp.example.com:4318/v1/traces',
        headers: { 'api-key': LICENSE_KEY },
        compression: CompressionAlgorithm.GZIP,
      });
      expect(
        exporterOptions(settings({ OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318' }), 'logs'),
      ).toMatchObject({ url: 'http://collector:4318/v1/logs', headers: {} });
    });

    it('no traza los health checks', () => {
      const [http] = createInstrumentations(settings());
      const { ignoreIncomingRequestHook } = http!.getConfig() as {
        ignoreIncomingRequestHook: (request: { url?: string }) => boolean;
      };

      expect(ignoreIncomingRequestHook({ url: '/health/ready' })).toBe(true);
      expect(ignoreIncomingRequestHook({ url: '/v1/circles/join-config' })).toBe(false);
      expect(ignoreIncomingRequestHook({})).toBe(false);
      expect(HEALTH_PATH.test('/health/live')).toBe(true);
      expect(HEALTH_PATH.test('/health/ready?x=1')).toBe(true);
      expect(HEALTH_PATH.test('/v1/circles/join-config')).toBe(false);
      expect(HEALTH_PATH.test('/healthy')).toBe(false);
    });

    it('envía logs al SDK solo con ENABLE_LOGGING, sin duplicar la correlación', () => {
      const pinoConfig = (enabled: boolean): unknown =>
        createInstrumentations(settings({ ENABLE_LOGGING: enabled }))
          .find((instrumentation) => instrumentation.instrumentationName.endsWith('pino'))
          ?.getConfig();

      expect(pinoConfig(true)).toMatchObject({
        disableLogSending: false,
        disableLogCorrelation: true,
      });
      expect(pinoConfig(false)).toMatchObject({ disableLogSending: true });
    });
  });

  describe('exportación OTLP', () => {
    let collector: Server;
    let endpoint: string;
    let received: Export[];
    /** ok: 200; reject: 400 (no reintentable); hang: no responde hasta terminar la prueba. */
    let collectorMode: 'ok' | 'reject' | 'hang';
    const pending: ServerResponse[] = [];

    beforeAll(async () => {
      collector = createServer((request, response) => {
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          received.push({
            path: request.url ?? '',
            headers: request.headers,
            body: gunzipSync(Buffer.concat(chunks)),
          });
          if (collectorMode === 'hang') pending.push(response);
          else
            response
              .writeHead(collectorMode === 'ok' ? 200 : 400, {
                'content-type': 'application/x-protobuf',
              })
              .end();
        });
      });
      await new Promise<void>((resolve) => collector.listen(0, '127.0.0.1', resolve));
      endpoint = `http://127.0.0.1:${(collector.address() as AddressInfo).port}`;
    });

    beforeEach(() => {
      received = [];
      collectorMode = 'ok';
    });

    afterEach(() => {
      for (const response of pending.splice(0)) response.writeHead(400).end();
    });

    afterAll(() => new Promise((resolve) => collector.close(resolve)));

    /** Genera una señal de cada tipo y cierra la telemetría, que envía lo pendiente. */
    async function emitAndShutdown(): Promise<string> {
      const traceId = trace.getTracer('test').startActiveSpan('operacion', (span) => {
        logs.getLogger('test').emit({ body: 'evento de prueba' });
        span.end();
        return span.spanContext().traceId;
      });
      metrics.getMeter('test').createCounter('pruebas').add(1);
      await new TelemetryShutdown().onApplicationShutdown();
      return traceId;
    }

    it('exporta trazas, métricas y logs con api-key, gzip y protobuf', async () => {
      startTelemetry(
        settings({
          ENABLE_TRACING: true,
          ENABLE_METRICS: true,
          ENABLE_LOGGING: true,
          OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
          NEW_RELIC_LICENSE_KEY: LICENSE_KEY,
        }),
      );
      const traceId = Buffer.from(await emitAndShutdown(), 'hex');

      expect(received.map((item) => item.path).sort()).toEqual([
        '/v1/logs',
        '/v1/metrics',
        '/v1/traces',
      ]);
      for (const item of received) {
        expect(item.headers).toMatchObject({
          'api-key': LICENSE_KEY,
          'content-encoding': 'gzip',
          'content-type': 'application/x-protobuf',
        });
        expect(item.body.includes('ayni-api')).toBe(true);
        expect(item.body.includes(LICENSE_KEY)).toBe(false);
      }
      const bodyOf = (path: string): Buffer | undefined =>
        received.find((item) => item.path === path)?.body;
      // El log emitido dentro del span lleva su trace id: así New Relic los enlaza.
      expect(bodyOf('/v1/traces')?.includes(traceId)).toBe(true);
      expect(bodyOf('/v1/logs')?.includes(traceId)).toBe(true);
      expect(activeTelemetry()).toBeUndefined();
    });

    it('con los flags en false no exporta nada, pero las trazas siguen teniendo id', async () => {
      startTelemetry(settings({ OTEL_EXPORTER_OTLP_ENDPOINT: endpoint }));
      const traceId = await emitAndShutdown();

      expect(traceId).toMatch(/^[0-9a-f]{32}$/);
      expect(traceId).not.toBe('0'.repeat(32));
      expect(received).toEqual([]);
    });

    it('iniciarla dos veces no registra providers duplicados', async () => {
      const first = startTelemetry(settings());

      expect(startTelemetry(settings({ ENABLE_TRACING: true }))).toBe(first);
      await first.shutdown();
    });

    it.each([
      ['rechaza el envío', 'reject'],
      ['no responde', 'hang'],
    ] as const)(
      'si el collector %s, la app cierra a tiempo y lo informa sin la license key',
      async (_case, mode) => {
        collectorMode = mode;
        const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
        const telemetry = startTelemetry(
          settings({
            ENABLE_TRACING: true,
            OTEL_EXPORTER_OTLP_ENDPOINT: endpoint,
            NEW_RELIC_LICENSE_KEY: LICENSE_KEY,
          }),
        );
        trace.getTracer('test').startSpan('operacion').end();

        const start = Date.now();
        await telemetry.shutdown(300);
        const elapsed = Date.now() - start;
        const output = stderr.mock.calls.map(([chunk]) => String(chunk)).join('');
        stderr.mockRestore();

        expect(elapsed).toBeLessThan(2000);
        expect(output).toContain('No se pudo enviar toda la telemetría pendiente');
        expect(output).not.toContain(LICENSE_KEY);
        expect(activeTelemetry()).toBeUndefined();
      },
    );

    it('cerrar sin telemetría activa no falla', async () => {
      await expect(new TelemetryShutdown().onApplicationShutdown()).resolves.toBeUndefined();
    });
  });
});
