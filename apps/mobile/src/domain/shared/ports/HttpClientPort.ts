export type QueryValue = string | number | boolean | null | undefined;

export interface HttpRequestOptions<T> {
  query?: Record<string, QueryValue>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Clave para operaciones no idempotentes (pagos, unirse a un círculo). */
  idempotencyKey?: string;
  /** Valida la respuesta en runtime; el genérico T por sí solo no valida nada. */
  parse?: (data: unknown) => T;
  /**
   * Endpoints de autenticación: un 401 no dispara la renovación de sesión ni la expira.
   * Obligatorio en /auth/refresh para que la renovación nunca se llame a sí misma.
   */
  skipSessionRefresh?: boolean;
}

export interface HttpBodyRequestOptions<T> extends HttpRequestOptions<T> {
  body?: unknown;
}

/** Contrato HTTP de la app. Los fallos se lanzan siempre como AppError. */
export interface HttpClientPort {
  get<T>(path: string, options?: HttpRequestOptions<T>): Promise<T>;
  post<T>(path: string, options?: HttpBodyRequestOptions<T>): Promise<T>;
  put<T>(path: string, options?: HttpBodyRequestOptions<T>): Promise<T>;
  patch<T>(path: string, options?: HttpBodyRequestOptions<T>): Promise<T>;
  delete<T>(path: string, options?: HttpBodyRequestOptions<T>): Promise<T>;
}
