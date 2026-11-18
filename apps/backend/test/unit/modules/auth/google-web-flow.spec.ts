import {
  GoogleWebFlowAdapter,
  type GoogleWebFlowSettings,
} from '@src/modules/auth/infrastructure/social/google-web-flow.adapter';
import { InfrastructureError } from '@src/shared/errors/app-error';

/**
 * Canje del authorization code de Google (COPAYNI-91 §9). Google no admite esquemas propios ni el
 * flujo implícito en apps instaladas, así que este canje ocurre en el backend con el client secret
 * del cliente Web. Lo que se comprueba aquí es que se envíe lo que Google exige —incluido el
 * `code_verifier` de PKCE— y que ningún fallo suyo se confunda con un id_token válido.
 */
const settings = (overrides: Partial<GoogleWebFlowSettings> = {}): GoogleWebFlowSettings => ({
  tokenUrl: 'https://oauth2.googleapis.com/token',
  clientId: '123-abc.apps.googleusercontent.com',
  clientSecret: 'secreto-del-cliente-web',
  redirectUri: 'https://backend-ayni.example.com/v1/auth/social/google/callback',
  timeoutMs: 5000,
  ...overrides,
});

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

/** El adaptador solo llama a `http(url, init)`, así que basta con esa forma. */
type FakeFetch = (url: string, init: { body?: string }) => Promise<Response>;

function adapter(options: { overrides?: Partial<GoogleWebFlowSettings>; http?: FakeFetch }): {
  adapter: GoogleWebFlowAdapter;
  calls: { url: string; body: URLSearchParams }[];
} {
  const calls: { url: string; body: URLSearchParams }[] = [];
  const http: FakeFetch =
    options.http ??
    ((url, init) => {
      calls.push({ url, body: new URLSearchParams(init.body ?? '') });
      return Promise.resolve(okResponse({ id_token: 'el.id.token' }));
    });

  return {
    adapter: new GoogleWebFlowAdapter(settings(options.overrides), http as unknown as typeof fetch),
    calls,
  };
}

const EXCHANGE = { code: 'codigo-de-google', codeVerifier: 'verifier-de-este-intento' };

describe('canje del código de Google', () => {
  it.each([
    ['sin client id', { clientId: '' }],
    ['sin client secret', { clientSecret: '' }],
    ['sin redirect uri', { redirectUri: '' }],
  ])('%s el flujo queda apagado y no se llama a Google', async (_caso, overrides) => {
    const { adapter: google, calls } = adapter({ overrides });

    expect(google.isConfigured()).toBe(false);
    await expect(google.exchange(EXCHANGE)).rejects.toThrow(InfrastructureError);
    expect(calls).toHaveLength(0);
  });

  it('con las tres credenciales está configurado', () => {
    expect(adapter({}).adapter.isConfigured()).toBe(true);
  });

  it('envía lo que Google exige, incluido el code_verifier de PKCE', async () => {
    const { adapter: google, calls } = adapter({});

    await expect(google.exchange(EXCHANGE)).resolves.toBe('el.id.token');
    expect(calls[0]?.url).toBe('https://oauth2.googleapis.com/token');
    const body = calls[0]?.body;
    expect(body?.get('grant_type')).toBe('authorization_code');
    expect(body?.get('code')).toBe('codigo-de-google');
    // Sin el verifier, quien intercepte el código en la vuelta no puede canjearlo.
    expect(body?.get('code_verifier')).toBe('verifier-de-este-intento');
    expect(body?.get('client_id')).toBe('123-abc.apps.googleusercontent.com');
    expect(body?.get('client_secret')).toBe('secreto-del-cliente-web');
    expect(body?.get('redirect_uri')).toBe(
      'https://backend-ayni.example.com/v1/auth/social/google/callback',
    );
  });

  it('si Google no responde, falla sin dejar pasar nada', async () => {
    const { adapter: google } = adapter({ http: () => Promise.reject(new Error('timeout')) });

    await expect(google.exchange(EXCHANGE)).rejects.toThrow('Google no respondió');
  });

  it('si Google rechaza el canje, no se confunde con un id_token', async () => {
    const { adapter: google } = adapter({
      http: () => Promise.resolve({ ok: false, status: 400 } as Response),
    });

    await expect(google.exchange(EXCHANGE)).rejects.toThrow('Google rechazó el canje');
  });

  it('un cuerpo que no es JSON se trata como respuesta sin id_token', async () => {
    const { adapter: google } = adapter({
      http: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error('no es JSON')),
        } as unknown as Response),
    });

    await expect(google.exchange(EXCHANGE)).rejects.toThrow('no devolvió el id_token');
  });

  it('un id_token que no es texto se rechaza', async () => {
    const { adapter: google } = adapter({
      http: () => Promise.resolve(okResponse({ id_token: 42 })),
    });

    await expect(google.exchange(EXCHANGE)).rejects.toThrow('no devolvió el id_token');
  });
});
