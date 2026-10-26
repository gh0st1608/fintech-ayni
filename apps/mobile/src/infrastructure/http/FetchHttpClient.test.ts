import { z } from 'zod';

import { AppError } from '@/domain/shared/errors/AppError';

import {
  FetchHttpClient,
  httpStatusToErrorKind,
  type FetchHttpClientConfig,
} from './FetchHttpClient';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function setup(overrides: Partial<FetchHttpClientConfig> = {}) {
  const fetchImpl = jest.fn<Promise<Response>, Parameters<typeof fetch>>();
  const client = new FetchHttpClient({
    baseUrl: 'https://api.test/v1/',
    timeoutMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    generateRequestId: () => 'req-1',
    ...overrides,
  });
  return { client, fetchImpl };
}

function hangUntilAborted(onStart?: () => void) {
  return (_url: unknown, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      onStart?.();
    });
}

async function captureError(promise: Promise<unknown>): Promise<AppError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof AppError) return error;
    throw error;
  }
  throw new Error('Expected an AppError');
}

describe('httpStatusToErrorKind', () => {
  it.each([
    [400, 'validation'],
    [422, 'validation'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [409, 'conflict'],
    [429, 'rate_limited'],
    [418, 'business'],
    [503, 'server'],
    [302, 'unknown'],
  ] as const)('%i → %s', (status, kind) => {
    expect(httpStatusToErrorKind(status)).toBe(kind);
  });
});

describe('FetchHttpClient', () => {
  it('desenvuelve { success, data } y envía headers de correlación, idioma y auth', async () => {
    const { client, fetchImpl } = setup({
      getAccessToken: async () => 'token-123',
      getLanguage: () => 'es',
    });
    fetchImpl.mockResolvedValue(jsonResponse({ success: true, data: { id: 1 }, traceId: 't' }));

    await expect(
      client.get('/circles', { query: { page: 2, q: 'a b', skip: undefined } }),
    ).resolves.toEqual({ id: 1 });

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.test/v1/circles?page=2&q=a%20b');
    expect(init?.headers).toMatchObject({
      Accept: 'application/json',
      'X-Request-Id': 'req-1',
      'Accept-Language': 'es',
      Authorization: 'Bearer token-123',
    });
  });

  it('serializa el body y envía Idempotency-Key en operaciones no idempotentes', async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(jsonResponse({ success: true, data: null }));

    await client.post('/circles/join', { body: { slot: 6 }, idempotencyKey: 'idem-1' });

    const init = fetchImpl.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"slot":6}');
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': 'idem-1',
    });
  });

  it('devuelve el cuerpo tal cual si no usa el contrato envolvente', async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(jsonResponse({ status: 'ok' }));
    await expect(client.get('/health')).resolves.toEqual({ status: 'ok' });
  });

  it('normaliza errores HTTP con código, mensaje y traceId del backend', async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(
      jsonResponse(
        {
          success: false,
          error: { code: 'RESOURCE_NOT_FOUND', message: 'No existe' },
          traceId: 'tr',
        },
        404,
      ),
    );
    await expect(captureError(client.get('/circles/9'))).resolves.toMatchObject({
      kind: 'not_found',
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'No existe',
      traceId: 'tr',
    });
  });

  it('ante 401 toma el traceId del header y notifica la sesión no autorizada', async () => {
    const onUnauthorized = jest.fn();
    const { client, fetchImpl } = setup({ onUnauthorized });
    fetchImpl.mockResolvedValue(
      new Response('', { status: 401, headers: { 'x-trace-id': 'h-1' } }),
    );

    await expect(captureError(client.get('/me'))).resolves.toMatchObject({
      kind: 'unauthorized',
      traceId: 'h-1',
      message: 'HTTP 401',
    });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('trata success:false con HTTP 200 como error de negocio', async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(jsonResponse({ success: false, error: { code: 'LIMIT' } }));
    await expect(captureError(client.get('/x'))).resolves.toMatchObject({
      kind: 'business',
      code: 'LIMIT',
    });
  });

  it('tolera cuerpos que no son JSON', async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockResolvedValue(new Response('<html>', { status: 502 }));
    await expect(captureError(client.get('/x'))).resolves.toMatchObject({
      kind: 'server',
      status: 502,
    });
  });

  it('mapea fallos de red a network', async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockRejectedValue(new TypeError('Network request failed'));
    await expect(captureError(client.get('/x'))).resolves.toMatchObject({ kind: 'network' });
  });

  it('aborta y reporta timeout al superar el tiempo máximo', async () => {
    jest.useFakeTimers();
    try {
      const { client, fetchImpl } = setup({ timeoutMs: 50 });
      fetchImpl.mockImplementation(hangUntilAborted());
      const pending = captureError(client.get('/slow'));
      await jest.advanceTimersByTimeAsync(60);
      await expect(pending).resolves.toMatchObject({ kind: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('reporta cancelled cuando el llamador aborta durante la petición', async () => {
    const { client, fetchImpl } = setup();
    const controller = new AbortController();
    let started!: () => void;
    const fetchStarted = new Promise<void>((resolve) => (started = resolve));
    fetchImpl.mockImplementation(hangUntilAborted(started));

    const pending = captureError(client.get('/x', { signal: controller.signal }));
    await fetchStarted;
    controller.abort();
    await expect(pending).resolves.toMatchObject({ kind: 'cancelled' });
  });

  it('no llama a la red si la señal ya estaba abortada', async () => {
    const { client, fetchImpl } = setup();
    const controller = new AbortController();
    controller.abort();
    await expect(
      captureError(client.get('/x', { signal: controller.signal })),
    ).resolves.toMatchObject({
      kind: 'cancelled',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('valida la respuesta en runtime con la función parse', async () => {
    const { client, fetchImpl } = setup();
    const parse = z.object({ id: z.number() }).parse;

    fetchImpl.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 7 } }));
    await expect(client.get('/ok', { parse })).resolves.toEqual({ id: 7 });

    fetchImpl.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 'x' } }));
    await expect(captureError(client.get('/bad', { parse }))).resolves.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('expone put, patch y delete', async () => {
    const { client, fetchImpl } = setup();
    fetchImpl.mockImplementation(async () => jsonResponse(undefined, 204));
    await client.put('/a', { body: {} });
    await client.patch('/a', { body: {} });
    await client.delete('/a');
    expect(fetchImpl.mock.calls.map(([, init]) => init?.method)).toEqual([
      'PUT',
      'PATCH',
      'DELETE',
    ]);
  });
});
