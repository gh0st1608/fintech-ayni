import {
  context,
  diag,
  type DiagLogger,
  DiagLogLevel,
  metrics,
  propagation,
  trace,
} from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';
import { AggregationTemporalityPreference } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPLogExporter } from '@opentelemetry/exporter-logs-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { type Instrumentation, registerInstrumentations } from '@opentelemetry/instrumentation';
import { ExpressInstrumentation, ExpressLayerType } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { CompressionAlgorithm } from '@opentelemetry/otlp-exporter-base';
import { defaultResource, type Resource, resourceFromAttributes } from '@opentelemetry/resources';
import { BatchLogRecordProcessor, LoggerProvider } from '@opentelemetry/sdk-logs';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import {
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';

import { type EnvironmentVariables } from '../../../config/env.validation';

export type TelemetrySettings = Pick<
  EnvironmentVariables,
  | 'APP_NAME'
  | 'APP_VERSION'
  | 'DEPLOYMENT_ENVIRONMENT'
  | 'LOG_LEVEL'
  | 'ENABLE_TRACING'
  | 'ENABLE_METRICS'
  | 'ENABLE_LOGGING'
  | 'OTEL_EXPORTER_OTLP_ENDPOINT'
  | 'NEW_RELIC_LICENSE_KEY'
>;

export interface Telemetry {
  /** Envía lo pendiente (como máximo `timeoutMs`) y apaga los providers. */
  shutdown(timeoutMs?: number): Promise<void>;
}

/** Tras SIGTERM el orquestador da un plazo limitado antes de matar el proceso. */
export const SHUTDOWN_TIMEOUT_MS = 5000;

type Signal = 'traces' | 'metrics' | 'logs';

/** Los health checks no generan trazas: los consultan los balanceadores cada pocos segundos. */
export const HEALTH_PATH = /^\/health(\/|\?|$)/;

let active: Telemetry | undefined;

/** Servicio, versión y ambiente: identifican la entidad en New Relic. */
export function buildResource(settings: TelemetrySettings): Resource {
  return defaultResource().merge(
    resourceFromAttributes({
      [ATTR_SERVICE_NAME]: settings.APP_NAME,
      [ATTR_SERVICE_VERSION]: settings.APP_VERSION,
      [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: settings.DEPLOYMENT_ENVIRONMENT,
    }),
  );
}

/**
 * OTLP/HTTP con protobuf y gzip, como recomienda New Relic. Con la license key se agrega la
 * cabecera `api-key`; sin ella sirve para cualquier collector OTLP (p. ej. uno local).
 */
export function exporterOptions(
  settings: TelemetrySettings,
  signal: Signal,
): { url: string; headers: Record<string, string>; compression: CompressionAlgorithm } {
  const base = (settings.OTEL_EXPORTER_OTLP_ENDPOINT ?? '').replace(/\/+$/, '');
  return {
    url: `${base}/v1/${signal}`,
    headers: settings.NEW_RELIC_LICENSE_KEY ? { 'api-key': settings.NEW_RELIC_LICENSE_KEY } : {},
    compression: CompressionAlgorithm.GZIP,
  };
}

/**
 * Una sola instrumentación por capa para no duplicar spans: HTTP crea el span de servidor,
 * Express solo aporta la ruta (sin spans por middleware ni handler) y NestJS el del controller.
 * Pino solo envía logs al SDK; la correlación con la traza la agrega el logger (`currentTraceIds`).
 */
export function createInstrumentations(settings: TelemetrySettings): Instrumentation[] {
  return [
    new HttpInstrumentation({
      ignoreIncomingRequestHook: (request) => HEALTH_PATH.test(request.url ?? ''),
    }),
    new ExpressInstrumentation({
      ignoreLayersType: [ExpressLayerType.MIDDLEWARE, ExpressLayerType.REQUEST_HANDLER],
    }),
    new NestInstrumentation(),
    new PinoInstrumentation({
      disableLogCorrelation: true,
      disableLogSending: !settings.ENABLE_LOGGING,
    }),
  ];
}

/**
 * Diagnóstico del SDK (p. ej. un export rechazado) como línea JSON en stderr. Solo el mensaje:
 * los argumentos pueden incluir la configuración del exporter, con la license key.
 */
function diagLogger(): DiagLogger {
  const write =
    (level: string) =>
    (message: string, ...args: unknown[]): void => {
      const error = args.find((arg): arg is Error => arg instanceof Error);
      const line = {
        level,
        context: 'OpenTelemetry',
        message,
        ...(error && { error: error.message }),
      };
      process.stderr.write(`${JSON.stringify(line)}\n`);
    };
  return {
    error: write('error'),
    warn: write('warn'),
    info: write('info'),
    debug: write('debug'),
    verbose: write('debug'),
  };
}

/**
 * Inicializa OpenTelemetry. Debe correr antes de cargar http, express, NestJS y pino (ver
 * `src/instrumentation.ts`). Las trazas se generan siempre, para correlacionar logs y devolver
 * `x-trace-id`; cada flag decide solo si esa señal se exporta. Llamarla dos veces no registra
 * nada nuevo.
 */
export function startTelemetry(settings: TelemetrySettings): Telemetry {
  if (active) return active;

  diag.setLogger(diagLogger(), {
    logLevel: settings.LOG_LEVEL === 'debug' ? DiagLogLevel.DEBUG : DiagLogLevel.WARN,
    suppressOverrideMessage: true,
  });

  const resource = buildResource(settings);
  const tracerProvider = new NodeTracerProvider({
    resource,
    spanProcessors: settings.ENABLE_TRACING
      ? [new BatchSpanProcessor(new OTLPTraceExporter(exporterOptions(settings, 'traces')))]
      : [],
  });
  tracerProvider.register();

  const meterProvider = settings.ENABLE_METRICS
    ? new MeterProvider({
        resource,
        readers: [
          new PeriodicExportingMetricReader({
            exporter: new OTLPMetricExporter({
              ...exporterOptions(settings, 'metrics'),
              // New Relic procesa métricas delta; con cumulative los contadores se acumulan mal.
              temporalityPreference: AggregationTemporalityPreference.DELTA,
            }),
          }),
        ],
      })
    : undefined;
  if (meterProvider) metrics.setGlobalMeterProvider(meterProvider);

  const loggerProvider = settings.ENABLE_LOGGING
    ? new LoggerProvider({
        resource,
        processors: [
          new BatchLogRecordProcessor({
            exporter: new OTLPLogExporter(exporterOptions(settings, 'logs')),
          }),
        ],
      })
    : undefined;
  if (loggerProvider) logs.setGlobalLoggerProvider(loggerProvider);

  const unregister = registerInstrumentations({
    instrumentations: createInstrumentations(settings),
    tracerProvider,
    meterProvider,
    loggerProvider,
  });

  const telemetry: Telemetry = {
    shutdown: async (timeoutMs = SHUTDOWN_TIMEOUT_MS) => {
      active = undefined;
      unregister();
      // Un collector caído no debe impedir cerrar la app: los exporters reintentan hasta su
      // timeout, así que se espera como máximo `timeoutMs` y el fallo se informa por diag.
      let timer: NodeJS.Timeout | undefined;
      const flushed = Promise.allSettled([
        tracerProvider.shutdown(),
        meterProvider?.shutdown(),
        loggerProvider?.shutdown(),
      ]).then((results) => results.every((result) => result.status === 'fulfilled'));
      const timedOut = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs).unref();
      });
      const complete = await Promise.race([flushed, timedOut]).finally(() => clearTimeout(timer));
      if (!complete) diag.error('No se pudo enviar toda la telemetría pendiente');
      trace.disable();
      context.disable();
      propagation.disable();
      metrics.disable();
      logs.disable();
      diag.disable();
    },
  };
  active = telemetry;
  return telemetry;
}

/** La telemetría iniciada en este proceso, si hay una. */
export function activeTelemetry(): Telemetry | undefined {
  return active;
}
