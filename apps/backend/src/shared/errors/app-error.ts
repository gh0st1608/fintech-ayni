/**
 * Jerarquía de errores de la aplicación. No depende de HTTP: el Exception Filter global
 * traduce cada `kind` a un código de estado (ver shared/presentation/filters).
 */
export type ErrorKind =
  | 'domain'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'infrastructure';

/** Detalles seguros de mostrar al cliente (p. ej. qué campo falló). Nunca datos sensibles. */
export type ErrorDetails = Readonly<Record<string, string>>;

export abstract class AppError extends Error {
  abstract readonly kind: ErrorKind;

  protected constructor(
    /** Código estable del contrato de API, p. ej. `OTP_INVALID`. */
    readonly code: string,
    message: string,
    readonly details?: ErrorDetails,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}

/** Regla de negocio incumplida. */
export class DomainError extends AppError {
  readonly kind = 'domain';

  constructor(code: string, message: string, details?: ErrorDetails) {
    super(code, message, details);
  }
}

/** Entrada que no cumple el contrato (formato, campos obligatorios). */
export class ValidationError extends AppError {
  readonly kind = 'validation';

  constructor(message: string, details?: ErrorDetails) {
    super('VALIDATION_ERROR', message, details);
  }
}

export class UnauthorizedError extends AppError {
  readonly kind = 'unauthorized';

  constructor(message = 'Autenticación requerida') {
    super('UNAUTHORIZED', message);
  }
}

export class ForbiddenError extends AppError {
  readonly kind = 'forbidden';

  constructor(message = 'Acceso denegado') {
    super('FORBIDDEN', message);
  }
}

export class NotFoundError extends AppError {
  readonly kind = 'not_found';

  constructor(message = 'No se encontró el recurso', code = 'NOT_FOUND') {
    super(code, message);
  }
}

export class ConflictError extends AppError {
  readonly kind = 'conflict';

  constructor(code: string, message: string, details?: ErrorDetails) {
    super(code, message, details);
  }
}

/** Límite de solicitudes superado. `retryAfterSeconds` llega al cliente como `Retry-After`. */
export class RateLimitedError extends AppError {
  readonly kind = 'rate_limited';

  constructor(
    readonly retryAfterSeconds: number,
    message = 'Demasiadas solicitudes, intenta más tarde',
  ) {
    super('RATE_LIMITED', message);
  }
}

/**
 * Fallo de persistencia o de un servicio externo. Conserva la causa para los logs;
 * el cliente solo recibe un mensaje genérico.
 */
export class InfrastructureError extends AppError {
  readonly kind = 'infrastructure';

  constructor(message: string, cause?: unknown) {
    super('INFRASTRUCTURE_ERROR', message, undefined, { cause });
  }
}
