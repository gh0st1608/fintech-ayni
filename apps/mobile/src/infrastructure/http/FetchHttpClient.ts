import { AppError, type AppErrorKind } from '@/domain/shared/errors/AppError';
import type {
  HttpBodyRequestOptions,
  HttpClientPort,
  HttpRequestOptions,
  QueryValue,
} from '@/domain/shared/ports/HttpClientPort';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface FetchHttpClientConfig {
  baseUrl: string;
  timeoutMs: number;
  getAccessToken?: () => Promise<string | null>;
  getLanguage?: () => string;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
  generateRequestId?: () => string;
}

/** Contrato de respuesta del backend NestJS: { success, data | error, traceId }. */
interface ResponseEnvelope {
  success?: boolean;
  data?: unknown;
  error?: { code?: string; message?: string; details?: Record<string, string> };
  traceId?: string;
}

export function httpStatusToErrorKind(status: number): AppErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server';
  if (status >= 400) return 'business';
  return 'unknown';
}

function defaultRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildUrl(baseUrl: string, path: string, query?: Record<string, QueryValue>): string {
  const url = `${baseUrl.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  const params = Object.entries(query ?? {})
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return params.length ? `${url}?${params.join('&')}` : url;
}

async function readEnvelope(response: Response): Promise<ResponseEnvelope | undefined> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as ResponseEnvelope;
  } catch {
    return undefined;
  }
}

/**
 * Adaptador HTTP sobre fetch: base URL, timeout, cancelación, headers de correlación y
 * normalización de errores a AppError. No reintenta: la política vive en la capa de consultas.
 */
export class FetchHttpClient implements HttpClientPort {
  private readonly fetchImpl: typeof fetch;
  private readonly generateRequestId: () => string;

  constructor(private readonly config: FetchHttpClientConfig) {
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.generateRequestId = config.generateRequestId ?? defaultRequestId;
  }

  get<T>(path: string, options?: HttpRequestOptions<T>): Promise<T> {
    return this.request('GET', path, options);
  }

  post<T>(path: string, options?: HttpBodyRequestOptions<T>): Promise<T> {
    return this.request('POST', path, options);
  }

  put<T>(path: string, options?: HttpBodyRequestOptions<T>): Promise<T> {
    return this.request('PUT', path, options);
  }

  patch<T>(path: string, options?: HttpBodyRequestOptions<T>): Promise<T> {
    return this.request('PATCH', path, options);
  }

  delete<T>(path: string, options?: HttpBodyRequestOptions<T>): Promise<T> {
    return this.request('DELETE', path, options);
  }

  private async request<T>(
    method: HttpMethod,
    path: string,
    options: HttpBodyRequestOptions<T> = {},
  ): Promise<T> {
    if (options.signal?.aborted) throw new AppError('cancelled', 'Request cancelled');

    const response = await this.send(method, path, options);
    const envelope = await readEnvelope(response);
    const traceId = envelope?.traceId ?? response.headers.get('x-trace-id') ?? undefined;

    if (!response.ok || envelope?.success === false) {
      if (response.status === 401) this.config.onUnauthorized?.();
      throw new AppError(
        response.ok ? 'business' : httpStatusToErrorKind(response.status),
        envelope?.error?.message ?? `HTTP ${response.status}`,
        {
          status: response.status,
          code: envelope?.error?.code,
          traceId,
          fieldErrors: envelope?.error?.details,
        },
      );
    }

    const data = envelope && 'success' in envelope ? envelope.data : envelope;
    if (!options.parse) return data as T;
    try {
      return options.parse(data);
    } catch (cause) {
      throw new AppError('unknown', 'Unexpected response shape', {
        status: response.status,
        code: 'INVALID_RESPONSE',
        traceId,
        cause,
      });
    }
  }

  private async send<T>(
    method: HttpMethod,
    path: string,
    options: HttpBodyRequestOptions<T>,
  ): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.config.timeoutMs);
    const abortFromCaller = () => controller.abort();
    options.signal?.addEventListener('abort', abortFromCaller);

    try {
      return await this.fetchImpl(buildUrl(this.config.baseUrl, path, options.query), {
        method,
        headers: await this.buildHeaders(options),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (cause) {
      if (timedOut) throw new AppError('timeout', 'Request timed out', { cause });
      if (options.signal?.aborted) throw new AppError('cancelled', 'Request cancelled', { cause });
      throw new AppError('network', 'Network request failed', { cause });
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', abortFromCaller);
    }
  }

  private async buildHeaders<T>(
    options: HttpBodyRequestOptions<T>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Request-Id': this.generateRequestId(),
      ...options.headers,
    };
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

    const language = this.config.getLanguage?.();
    if (language) headers['Accept-Language'] = language;

    const token = await this.config.getAccessToken?.();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }
}
