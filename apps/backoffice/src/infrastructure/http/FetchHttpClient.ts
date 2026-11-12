import type { z } from 'zod';

import { AppError, type AppErrorKind } from '@/domain/shared/AppError';

import type { TokenStore } from './TokenStore';

export interface RequestOptions<T> {
  schema: z.ZodType<T>;
  body?: unknown;
  signal?: AbortSignal;
  /** Sin el token del personal (p. ej. la sesión de desarrollo). */
  anonymous?: boolean;
}

export interface HttpClientPort {
  get<T>(path: string, options: RequestOptions<T>): Promise<T>;
  post<T>(path: string, options: RequestOptions<T>): Promise<T>;
  put<T>(path: string, options: RequestOptions<T>): Promise<T>;
}

type Fetch = typeof fetch;

interface ErrorEnvelope {
  error?: { code?: unknown; message?: unknown };
  traceId?: unknown;
}

const KIND_BY_STATUS: Record<number, AppErrorKind> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  422: 'business',
  429: 'rate_limited',
};

/** El backend pide volver a autenticarse para una acción crítica (step-up) con este mensaje. */
const STEP_UP = /vuelve a autenticarte/i;

/**
 * Cliente HTTP del backend de Ayni. Desenvuelve `{ success, data, traceId }`, valida la respuesta
 * con Zod y traduce los errores HTTP y de red a `AppError`. No reintenta: las mutaciones no son
 * idempotentes y TanStack Query decide los reintentos de las lecturas.
 */
export class FetchHttpClient implements HttpClientPort {
  constructor(
    private readonly baseUrl: string,
    private readonly tokens: TokenStore,
    private readonly timeoutMs: number,
    private readonly fetchFn: Fetch = (...args) => fetch(...args),
  ) {}

  get<T>(path: string, options: RequestOptions<T>): Promise<T> {
    return this.request('GET', path, options);
  }

  post<T>(path: string, options: RequestOptions<T>): Promise<T> {
    return this.request('POST', path, options);
  }

  put<T>(path: string, options: RequestOptions<T>): Promise<T> {
    return this.request('PUT', path, options);
  }

  private async request<T>(method: string, path: string, options: RequestOptions<T>): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = options.anonymous ? null : this.tokens.get();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await this.fetchFn(new URL(path, this.baseUrl), {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal,
      });
    } catch (error) {
      if (options.signal?.aborted) throw error;
      if (timeout.aborted)
        throw new AppError('timeout', 'El servidor tardó demasiado en responder');
      throw new AppError('network', 'No pudimos conectarnos con el servidor');
    }

    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) throw this.toError(response.status, payload);
    const data = (payload as { data?: unknown } | null)?.data;
    const parsed = options.schema.safeParse(data);
    if (!parsed.success) {
      throw new AppError('unknown', 'La respuesta del servidor no tiene el formato esperado');
    }
    return parsed.data;
  }

  private toError(status: number, payload: unknown): AppError {
    const envelope = (payload ?? {}) as ErrorEnvelope;
    const code = typeof envelope.error?.code === 'string' ? envelope.error.code : undefined;
    const message =
      typeof envelope.error?.message === 'string' ? envelope.error.message : `Error ${status}`;
    const traceId = typeof envelope.traceId === 'string' ? envelope.traceId : undefined;
    const kind =
      status === 401 && STEP_UP.test(message)
        ? 'step_up_required'
        : (KIND_BY_STATUS[status] ?? (status >= 500 ? 'server' : 'unknown'));
    return new AppError(kind, message, code, traceId);
  }
}
