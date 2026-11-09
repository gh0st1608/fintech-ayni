import { z } from 'zod';

import { AppError } from '@/domain/shared/AppError';

import { CirclesApiRepository, DevStaffAuth } from './api/adapters';
import { FetchHttpClient } from './http/FetchHttpClient';
import { TokenStore } from './http/TokenStore';

type Reply = { status: number; body: unknown } | Error;

function setup(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = jest.fn((url: URL | RequestInfo, init?: RequestInit) => {
    const href = url instanceof URL ? url.href : typeof url === 'string' ? url : url.url;
    calls.push({ url: href, init: init ?? {} });
    const reply = replies.shift() ?? { status: 500, body: {} };
    if (reply instanceof Error) return Promise.reject(reply);
    // jsdom no trae Response: basta con lo que usa el cliente.
    return Promise.resolve({
      ok: reply.status < 400,
      status: reply.status,
      json: () => Promise.resolve(reply.body),
    } as Response);
  }) as unknown as typeof fetch;
  const tokens = new TokenStore();
  const http = new FetchHttpClient('http://api.test', tokens, 5_000, fetchFn);
  return { calls, tokens, http };
}

const ok = (data: unknown) => ({ status: 200, body: { success: true, data, traceId: 't' } });
const fail = (status: number, code: string, message = 'x') => ({
  status,
  body: { success: false, error: { code, message }, traceId: 'trace-1' },
});

const STAFF = {
  staffId: 'dev:ops@ayni.local',
  email: 'ops@ayni.local',
  roles: ['operations', 'rol-futuro'],
  authenticatedAt: '2026-11-09T15:00:00.000Z',
};

describe('FetchHttpClient', () => {
  it('desenvuelve la respuesta, la valida y envía el token', async () => {
    const { calls, tokens, http } = setup([ok({ value: 1 })]);
    tokens.set('tok');
    await expect(http.get('/x', { schema: z.object({ value: z.number() }) })).resolves.toEqual({
      value: 1,
    });
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('no envía el token en las peticiones anónimas', async () => {
    const { calls, tokens, http } = setup([ok({})]);
    tokens.set('tok');
    await http.post('/x', { schema: z.object({}), body: { a: 1 }, anonymous: true });
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
    expect(calls[0]?.init.body).toBe('{"a":1}');
  });

  it.each([
    [fail(401, 'UNAUTHORIZED', 'Vuelve a autenticarte para esta acción'), 'step_up_required'],
    [fail(401, 'UNAUTHORIZED'), 'unauthorized'],
    [fail(403, 'FORBIDDEN'), 'forbidden'],
    [fail(404, 'CIRCLE_NOT_FOUND'), 'not_found'],
    [fail(422, 'INVALID_CYCLE_TRANSITION'), 'business'],
    [fail(503, 'UNAVAILABLE'), 'server'],
    [{ status: 418, body: null }, 'unknown'],
  ])('traduce los errores HTTP (%#)', async (reply, kind) => {
    const { http } = setup([reply]);
    await expect(http.get('/x', { schema: z.object({}) })).rejects.toMatchObject({ kind });
  });

  it('conserva el código y el trace id del backend', async () => {
    const { http } = setup([fail(404, 'CIRCLE_NOT_FOUND')]);
    await expect(http.get('/x', { schema: z.object({}) })).rejects.toMatchObject({
      code: 'CIRCLE_NOT_FOUND',
      traceId: 'trace-1',
    });
  });

  it('un fallo de red es un error de red', async () => {
    const { http } = setup([new TypeError('Failed to fetch')]);
    await expect(http.get('/x', { schema: z.object({}) })).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('una respuesta con otro formato no pasa', async () => {
    const { http } = setup([ok({ value: 'texto' })]);
    await expect(http.get('/x', { schema: z.object({ value: z.number() }) })).rejects.toMatchObject(
      { kind: 'unknown' },
    );
  });

  it('una cancelación del llamador se propaga tal cual', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('Aborted', 'AbortError');
    const { http } = setup([abort]);
    await expect(http.get('/x', { schema: z.object({}), signal: controller.signal })).rejects.toBe(
      abort,
    );
  });
});

describe('DevStaffAuth', () => {
  it('inicia sesión, guarda el token en memoria e ignora roles desconocidos', async () => {
    const { calls, tokens, http } = setup([ok({ accessToken: 'tok', expiresIn: 3600 }), ok(STAFF)]);
    const auth = new DevStaffAuth(http, tokens);
    const staff = await auth.signIn({ email: 'ops@ayni.local', roles: ['operations'] });
    expect(staff.roles).toEqual(['operations']);
    expect(staff.authenticatedAt).toEqual(new Date(STAFF.authenticatedAt));
    expect(tokens.get()).toBe('tok');
    expect(calls.map(({ url }) => url)).toEqual([
      'http://api.test/admin/v1/dev/sessions',
      'http://api.test/admin/v1/me',
    ]);
    auth.signOut();
    expect(tokens.get()).toBeNull();
  });

  it('sin token no hay sesión, y un token rechazado se descarta', async () => {
    const { tokens, http } = setup([fail(401, 'UNAUTHORIZED')]);
    const auth = new DevStaffAuth(http, tokens);
    await expect(auth.current()).resolves.toBeNull();
    tokens.set('vencido');
    await expect(auth.current()).resolves.toBeNull();
    expect(tokens.get()).toBeNull();
  });

  it('otros errores al consultar la sesión se propagan', async () => {
    const { tokens, http } = setup([fail(503, 'UNAVAILABLE')]);
    tokens.set('tok');
    await expect(new DevStaffAuth(http, tokens).current()).rejects.toBeInstanceOf(AppError);
  });

  it('si el backend no confirma la sesión, falla', async () => {
    const { tokens, http } = setup([
      ok({ accessToken: 'tok', expiresIn: 3600 }),
      fail(401, 'UNAUTHORIZED'),
    ]);
    await expect(
      new DevStaffAuth(http, tokens).signIn({ email: 'a@b.pe', roles: ['support'] }),
    ).rejects.toMatchObject({ kind: 'unauthorized' });
  });
});

describe('CirclesApiRepository', () => {
  const summary = {
    circleId: '00000000-0000-4000-8000-000000000001',
    state: 'paused',
    payout: { amount: 600000, currency: 'PEN' },
    months: 6,
    startsOn: '2026-12',
    members: 4,
    createdAt: '2026-11-09T15:00:00.000Z',
  };

  it('arma el filtro y el cursor en la URL', async () => {
    const { calls, http } = setup([
      ok({ items: [summary], nextCursor: 'c2' }),
      ok({ items: [], nextCursor: null }),
    ]);
    const repository = new CirclesApiRepository(http);
    const page = await repository.list({ state: 'paused', cursor: 'c1', limit: 10 });
    expect(page.items[0]?.createdAt).toEqual(new Date(summary.createdAt));
    await repository.list({});
    expect(calls.map(({ url }) => url)).toEqual([
      'http://api.test/admin/v1/circles?state=paused&cursor=c1&limit=10',
      'http://api.test/admin/v1/circles',
    ]);
  });

  it('lee el detalle y pausa con el motivo', async () => {
    const detail = {
      ...summary,
      currentPeriod: '2026-12',
      pausedOn: '2026-12-10',
      memberships: [],
      startProposal: null,
    };
    const { calls, http } = setup([
      ok(detail),
      ok({ circleId: summary.circleId, state: 'paused', changed: true }),
    ]);
    const repository = new CirclesApiRepository(http);
    await expect(repository.get(summary.circleId)).resolves.toMatchObject({
      pausedOn: '2026-12-10',
    });
    await expect(repository.setPause(summary.circleId, 'pause', 'Reclamo')).resolves.toEqual({
      state: 'paused',
      changed: true,
    });
    expect(calls[1]).toMatchObject({
      url: `http://api.test/admin/v1/circles/${summary.circleId}/pause`,
      init: { method: 'POST', body: '{"reason":"Reclamo"}' },
    });
  });
});
