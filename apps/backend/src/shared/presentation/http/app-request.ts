import { randomUUID } from 'node:crypto';

import { type NextFunction, type Request, type Response } from 'express';

import { type Principal } from '../../application/ports/access-token-verifier.port';

export const TRACE_ID_HEADER = 'x-trace-id';

/** Petición HTTP con los datos que agregan el middleware de trazas y el guard de auth. */
export interface AppRequest extends Request {
  traceId?: string;
  principal?: Principal;
}

/**
 * Asigna un identificador a cada petición y lo devuelve en `x-trace-id`. No se acepta uno
 * enviado por el cliente. Con OpenTelemetry (COPAYNI-10) pasará a ser el trace id real.
 */
export function traceIdMiddleware(
  request: AppRequest,
  response: Response,
  next: NextFunction,
): void {
  request.traceId = randomUUID();
  response.setHeader(TRACE_ID_HEADER, request.traceId);
  next();
}

/** Trace id de la petición; si el middleware no corrió, genera uno para no responder sin él. */
export function traceIdOf(request: AppRequest): string {
  request.traceId ??= randomUUID();
  return request.traceId;
}
