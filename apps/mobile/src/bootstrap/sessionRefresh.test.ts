import { SessionEvents } from '@/application/auth/SessionEvents';
import { RefreshSessionUseCase } from '@/application/auth/usecases/RefreshSessionUseCase';
import { SignOutUseCase } from '@/application/auth/usecases/SignOutUseCase';
import { AuthTokens } from '@/domain/auth/value-objects/AuthTokens';
import { AuthApiRepository } from '@/infrastructure/auth/AuthApiRepository';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { InMemoryTokenStorage } from '@test/fakes/ports';

/**
 * Integración de la renovación tal como se compone en container.ts: FetchHttpClient real,
 * AuthApiRepository real y RefreshSessionUseCase, con el backend simulado en fetch.
 */
function setup(backend: (path: string, init: RequestInit) => Response) {
  const storage = new InMemoryTokenStorage();
  storage.tokens = AuthTokens.create({ accessToken: 'old-access', refreshToken: 'r1' });
  const events = new SessionEvents();
  const expired = jest.fn();
  events.subscribe(expired);

  const fetchImpl = jest.fn(async (url: string, init: RequestInit) =>
    backend(url.replace('https://api.test/v1', ''), init),
  );
  const http: FetchHttpClient = new FetchHttpClient({
    baseUrl: 'https://api.test/v1',
    timeoutMs: 1000,
    fetchImpl: fetchImpl as unknown as typeof fetch,
    getAccessToken: async () => (await storage.read())?.accessToken ?? null,
    renewSession: (): Promise<boolean> => refresh.execute(),
    onUnauthorized: () => void refresh.expire(),
  });
  const authApi: AuthApiRepository = new AuthApiRepository(http);
  const refresh: RefreshSessionUseCase = new RefreshSessionUseCase(
    authApi,
    storage,
    new SignOutUseCase(storage, authApi),
    events,
  );
  const calls = (path: string) => fetchImpl.mock.calls.filter(([url]) => url.endsWith(path)).length;
  return { http, storage, expired, calls };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const authHeader = (init: RequestInit) =>
  (init.headers as Record<string, string> | undefined)?.Authorization;

describe('renovación de sesión (integración)', () => {
  it('4 peticiones con 401 simultáneo hacen una sola renovación y se reintentan con el token nuevo', async () => {
    const { http, storage, expired, calls } = setup((path, init) => {
      if (path === '/auth/refresh') {
        return json({ success: true, data: { accessToken: 'new-access', refreshToken: 'r2' } });
      }
      return authHeader(init) === 'Bearer new-access'
        ? json({ success: true, data: path })
        : json({ success: false }, 401);
    });

    const results = await Promise.all(['/a', '/b', '/c', '/d'].map((path) => http.get(path)));

    expect(results).toEqual(['/a', '/b', '/c', '/d']);
    expect(calls('/auth/refresh')).toBe(1);
    expect(storage.tokens).toMatchObject({ accessToken: 'new-access', refreshToken: 'r2' });
    expect(expired).not.toHaveBeenCalled();
  });

  it('si /auth/refresh responde 401 no se renueva de nuevo y la sesión expira', async () => {
    const { http, storage, expired, calls } = setup(() => json({ success: false }, 401));

    await expect(http.get('/me')).rejects.toMatchObject({ kind: 'unauthorized' });

    expect(calls('/auth/refresh')).toBe(1);
    expect(calls('/me')).toBe(1);
    expect(storage.tokens).toBeNull();
    expect(expired).toHaveBeenCalledWith('sessionExpired');
  });

  it('si la petición reintentada vuelve a dar 401 no hay segundo reintento', async () => {
    const { http, expired, calls } = setup((path) =>
      path === '/auth/refresh'
        ? json({ success: true, data: { accessToken: 'new-access', refreshToken: 'r2' } })
        : json({ success: false }, 401),
    );

    await expect(http.get('/me')).rejects.toMatchObject({ kind: 'unauthorized' });
    await new Promise((resolve) => setImmediate(resolve));

    expect(calls('/me')).toBe(2);
    expect(calls('/auth/refresh')).toBe(1);
    expect(expired).toHaveBeenCalledWith('sessionExpired');
  });
});
