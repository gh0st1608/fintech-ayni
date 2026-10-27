import { randomBytes } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { type NextFunction, type Request, type Response } from 'express';

import { type Principal } from '../../application/ports/access-token-verifier.port';
import { currentTraceIds } from '../../infrastructure/observability/logger';
import { HEALTH_PATH } from '../../infrastructure/observability/telemetry';

export const TRACE_ID_HEADER = 'x-trace-id';

/** Petición HTTP con los datos que agregan el middleware de trazas y el guard de auth. */
export interface AppRequest extends Request {
  traceId?: string;
  principal?: Principal;
}

/** Mismo formato que un trace id de OpenTelemetry (32 hex), por si no hay traza activa. */
const randomTraceId = (): string => randomBytes(16).toString('hex');

/**
 * Asigna a cada petición el trace id de OpenTelemetry y lo devuelve en `x-trace-id`, para
 * buscar la traza y sus logs en New Relic. Fuera de una traza (p. ej. health checks, que no
 * se trazan) se genera uno con el mismo formato.
 */
export function traceIdMiddleware(
  request: AppRequest,
  response: Response,
  next: NextFunction,
): void {
  request.traceId = currentTraceIds()?.traceId ?? randomTraceId();
  response.setHeader(TRACE_ID_HEADER, request.traceId);
  next();
}

/** Trace id de la petición; si el middleware no corrió, genera uno para no responder sin él. */
export function traceIdOf(request: AppRequest): string {
  request.traceId ??= randomTraceId();
  return request.traceId;
}

const accessLogger = new Logger('HTTP');

/**
 * Una línea por petición al terminar la respuesta: método, ruta sin query string (puede
 * llevar datos sensibles), estado y duración. Los health checks solo en nivel debug.
 */
export function accessLogMiddleware(
  request: AppRequest,
  response: Response,
  next: NextFunction,
): void {
  const start = process.hrtime.bigint();
  const { method, path } = request;
  response.once('finish', () => {
    const entry = {
      message: `${method} ${path} ${response.statusCode}`,
      method,
      path,
      statusCode: response.statusCode,
      durationMs: Number(process.hrtime.bigint() - start) / 1e6,
      traceId: traceIdOf(request),
    };
    if (HEALTH_PATH.test(path)) accessLogger.debug(entry);
    else accessLogger.log(entry);
  });
  next();
}
