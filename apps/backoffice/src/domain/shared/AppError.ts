export type AppErrorKind =
  | 'validation'
  | 'unauthorized'
  | 'step_up_required'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'business'
  | 'rate_limited'
  | 'network'
  | 'timeout'
  | 'server'
  | 'unknown';

/** Errores que se pueden reintentar sin riesgo: no son del usuario ni de reglas de negocio. */
const RETRYABLE: ReadonlySet<AppErrorKind> = new Set(['network', 'timeout', 'server']);

/**
 * Error de la aplicación con un tipo estable para la UI. `code` es el del backend (p. ej.
 * `CIRCLE_NOT_FOUND`) y `traceId` permite encontrar la traza; ninguno lleva datos sensibles.
 */
export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    message: string,
    readonly code?: string,
    readonly traceId?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }

  get retryable(): boolean {
    return RETRYABLE.has(this.kind);
  }
}
