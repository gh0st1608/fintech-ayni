import {
  LinkSocialProviderUseCase,
  ListAvailableProvidersUseCase,
  ListSocialProvidersUseCase,
  UnlinkSocialProviderUseCase,
} from '@/application/auth/usecases/socialLoginUseCases';
import type { SocialCredential } from '@/domain/auth/SocialLogin';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';

import { FakeSocialSignIn } from './ExpoSocialSignIn';
import { InMemorySocialAuthApi } from './InMemorySocialAuthApi';
import { SocialAuthApiRepository } from './SocialAuthApiRepository';

const CREDENTIAL: SocialCredential = {
  provider: 'google',
  idToken: 'cabecera.contenido.firma',
  nonce: 'nonce-de-este-intento',
};

const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setup() {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = jest.fn((...[url, init]: Parameters<typeof fetch>) => {
    calls.push({
      url: url instanceof URL ? url.href : typeof url === 'string' ? url : url.url,
      init: init ?? {},
    });
    return Promise.resolve(
      respond({
        success: true,
        data: { accessToken: 'access', refreshToken: 'refresh', identities: [] },
        traceId: 't',
      }),
    );
  }) as unknown as typeof fetch;
  const http = new FetchHttpClient({
    baseUrl: 'https://api.test/v1',
    timeoutMs: 1000,
    fetchImpl,
  });
  return { calls, repository: new SocialAuthApiRepository(http) };
}

describe('SocialAuthApiRepository (COPAYNI-91)', () => {
  it('canjea la credencial por la sesión, en la ruta del proveedor', async () => {
    const { repository, calls } = setup();
    const tokens = await repository.login(CREDENTIAL);

    expect(calls[0]?.url).toContain('/auth/social/google');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      idToken: CREDENTIAL.idToken,
      nonce: CREDENTIAL.nonce,
    });
    expect(tokens.accessToken).toBe('access');
  });

  it('el inicio de sesión no manda la cabecera de una sesión que todavía no existe', async () => {
    const { repository, calls } = setup();
    await repository.login(CREDENTIAL);
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBeUndefined();
  });

  it('canjea el código interno del flujo web de Apple', async () => {
    const { repository, calls } = setup();
    await repository.exchange('codigo-interno');

    expect(calls[0]?.url).toContain('/auth/social/apple/exchange');
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({ code: 'codigo-interno' });
  });

  it('vincula y desvincula en la ruta del perfil', async () => {
    const { repository, calls } = setup();
    await repository.link(CREDENTIAL);
    await repository.unlink('apple');

    expect(calls[0]?.url).toContain('/me/social-identities/google');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[1]?.url).toContain('/me/social-identities/apple');
    expect(calls[1]?.init.method).toBe('DELETE');
  });

  it('lista los proveedores vinculados', async () => {
    const { repository, calls } = setup();
    await expect(repository.list()).resolves.toEqual([]);
    expect(calls[0]?.url).toContain('/me/social-identities');
  });
});

describe('vincular desde el perfil', () => {
  function useCases(result?: Parameters<FakeSocialSignIn['set']>[0]) {
    const signIn = new FakeSocialSignIn(result ? { result } : {});
    const api = new InMemorySocialAuthApi();
    return {
      signIn,
      api,
      link: new LinkSocialProviderUseCase(signIn, api),
      unlink: new UnlinkSocialProviderUseCase(api),
      list: new ListSocialProvidersUseCase(api),
      available: new ListAvailableProvidersUseCase(signIn),
    };
  }

  it('vincula el proveedor y queda listado', async () => {
    const { link, list, api } = useCases();
    await expect(link.execute('apple')).resolves.toBe('linked');
    expect(api.linked.has('apple')).toBe(true);
    await expect(list.execute()).resolves.toEqual(['apple']);
  });

  it('cancelar no vincula nada', async () => {
    const { link, api } = useCases({ status: 'cancelled' });
    await expect(link.execute('google')).resolves.toBe('cancelled');
    expect(api.linked.size).toBe(0);
  });

  it('el flujo web no sirve para vincular: abriría sesión en vez de vincular', async () => {
    const { link, api } = useCases({ status: 'session', exchangeCode: 'codigo' });
    await expect(link.execute('apple')).resolves.toBe('unsupported');
    expect(api.linked.size).toBe(0);
  });

  it('desvincular lo quita de la lista', async () => {
    const { link, unlink, list } = useCases();
    await link.execute('google');
    await unlink.execute('google');
    await expect(list.execute()).resolves.toEqual([]);
  });

  it('solo ofrece los proveedores que el dispositivo admite', async () => {
    const signIn = new FakeSocialSignIn({ available: ['apple'] });
    const available = new ListAvailableProvidersUseCase(signIn);
    await expect(available.execute(['google', 'apple'])).resolves.toEqual(['apple']);
  });
});
