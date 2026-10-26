/** Clasificación común de fallos técnicos y de negocio que la UI sabe traducir a mensajes. */
export type AppErrorKind =
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'validation'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'business'
  | 'server'
  | 'unknown';

export interface AppErrorDetails {
  status?: number;
  /** Código de error del backend, p. ej. RESOURCE_NOT_FOUND. */
  code?: string;
  /** traceId del backend para correlacionar con la observabilidad. */
  traceId?: string;
  fieldErrors?: Record<string, string>;
  /** Segundos de espera indicados por el backend (Retry-After) en un rate_limited. */
  retryAfterSeconds?: number;
  cause?: unknown;
}

const TRANSIENT_KINDS: ReadonlySet<AppErrorKind> = new Set(['network', 'timeout', 'server']);

export class AppError extends Error {
  readonly kind: AppErrorKind;
  readonly status?: number;
  readonly code?: string;
  readonly traceId?: string;
  readonly fieldErrors?: Record<string, string>;
  readonly retryAfterSeconds?: number;

  constructor(kind: AppErrorKind, message: string, details: AppErrorDetails = {}) {
    super(message, { cause: details.cause });
    this.name = 'AppError';
    this.kind = kind;
    this.status = details.status;
    this.code = details.code;
    this.traceId = details.traceId;
    this.fieldErrors = details.fieldErrors;
    this.retryAfterSeconds = details.retryAfterSeconds;
  }

  /** Solo los fallos transitorios admiten reintento; nunca los de negocio o validación. */
  get isTransient(): boolean {
    return TRANSIENT_KINDS.has(this.kind);
  }
}
