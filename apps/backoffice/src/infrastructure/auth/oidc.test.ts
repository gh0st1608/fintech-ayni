import { AppError } from '@/domain/shared/AppError';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { TokenStore } from '@/infrastructure/http/TokenStore';

import { discoverOidcEndpoints, OidcStaffAuth } from './OidcStaffAuth';

const ISSUER = 'https://identitycenter.amazonaws.com/ssoins-1234567890abcdef';
const CLIENT_ID = 'arn:aws:sso::079982009754:application/ssoins-123/apl-456';
const REDIRECT_URI = 'https://backoffice.solutionserj.com/auth/callback';

const DISCOVERY = {
  authorization_endpoint: `${ISSUER}/authorize`,
  token_endpoint: `${ISSUER}/token`,
  end_session_endpoint: `${ISSUER}/logout`,
};

const STAFF_ME = {
  staffId: '9067e3f8-0000-4000-8000-000000000001',
  email: 'ops@ayni.pe',
  roles: ['operations', 'rol-que-no-existe'],
  authenticatedAt: '2026-11-16T15:00:00.000Z',
};

type Reply = { status: number; body: unknown } | Error;

/**
 * Cada caso declara las respuestas en el orden en que se piden: primero el documento de
 * descubrimiento, luego el token y luego `/admin/v1/me`.
 */
function setup(replies: Reply[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchFn = jest.fn((url: URL | RequestInfo, init?: RequestInit) => {
    const href = url instanceof URL ? url.href : typeof url === 'string' ? url : url.url;
    calls.push({ url: href, init: init ?? {} });
    const reply = replies.shift() ?? { status: 500, body: {} };
    if (reply instanceof Error) return Promise.reject(reply);
    return Promise.resolve({
      ok: reply.status < 400,
      status: reply.status,
      json: () => Promise.resolve(reply.body),
    } as Response);
  }) as unknown as typeof fetch;

  const redirects: string[] = [];
  const tokens = new TokenStore();
  const http = new FetchHttpClient('http://api.test', tokens, 5_000, fetchFn);
  const auth = new OidcStaffAuth(ISSUER, CLIENT_ID, REDIRECT_URI, http, tokens, fetchFn, (url) =>
    redirects.push(url),
  );
  return { auth, calls, redirects, tokens, fetchFn };
}

const discovery = (body: unknown = DISCOVERY) => ({ status: 200, body });
const apiOk = (data: unknown) => ({ status: 200, body: { success: true, data, traceId: 't' } });
const apiFail = (status: number, code: string) => ({
  status,
  body: { success: false, error: { code, message: 'x' }, traceId: 't' },
});

/** Espera a que la redirección ocurra: `initiateFlow` no devuelve promesa (el puerto es `void`). */
async function waitForRedirect(redirects: string[]): Promise<URL> {
  for (let attempt = 0; attempt < 20 && redirects.length === 0; attempt += 1) {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const [first] = redirects;
  if (!first) throw new Error('No hubo redirección');
  return new URL(first);
}

/** Lee un valor que debe existir; el lint prohibe las aserciones de no nulidad. */
function required<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`Falta ${what}`);
  return value;
}

async function expectedChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('discoverOidcEndpoints', () => {
  it('pide el documento de descubrimiento del issuer, sin duplicar la barra final', async () => {
    const { fetchFn } = setup([discovery()]);
    await expect(discoverOidcEndpoints(`${ISSUER}/`, fetchFn)).resolves.toEqual(DISCOVERY);
    expect(fetchFn).toHaveBeenCalledWith(`${ISSUER}/.well-known/openid-configuration`);
  });

  it('falla si el proveedor no responde', async () => {
    const { fetchFn } = setup([{ status: 503, body: {} }]);
    await expect(discoverOidcEndpoints(ISSUER, fetchFn)).rejects.toThrow(
      /No se pudo obtener la configuración OIDC/,
    );
  });

  it('falla si el documento no trae los endpoints que hacen falta', async () => {
    const { fetchFn } = setup([discovery({ authorization_endpoint: `${ISSUER}/authorize` })]);
    await expect(discoverOidcEndpoints(ISSUER, fetchFn)).rejects.toThrow(
      /Documento OIDC incompleto/,
    );
  });
});

describe('OidcStaffAuth: inicio del flujo', () => {
  it('redirige al proveedor con PKCE S256, el state y los scopes', async () => {
    const { auth, redirects } = setup([discovery()]);
    auth.initiateFlow('/kyc');
    const url = await waitForRedirect(redirects);

    expect(url.origin + url.pathname).toBe(`${ISSUER}/authorize`);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT_URI);
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');

    // El desafío es el SHA-256 del verificador guardado: lo que hace al PKCE verificable.
    const verifier = sessionStorage.getItem('oidc_code_verifier');
    expect(verifier).toMatch(/^[\w-]{43}$/);
    expect(url.searchParams.get('code_challenge')).toBe(
      await expectedChallenge(required(verifier, 'el verificador')),
    );
    expect(url.searchParams.get('state')).toBe(sessionStorage.getItem('oidc_state'));
    expect(sessionStorage.getItem('oidc_return_to')).toBe('/kyc');
  });

  it('sin destino de retorno no guarda ninguno de un intento anterior', async () => {
    sessionStorage.setItem('oidc_return_to', '/finance');
    const { auth, redirects } = setup([discovery()]);
    auth.initiateFlow();
    await waitForRedirect(redirects);
    expect(sessionStorage.getItem('oidc_return_to')).toBeNull();
  });

  it('no redirige si falla el descubrimiento', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const { auth, redirects } = setup([{ status: 500, body: {} }]);
    auth.initiateFlow();
    for (let attempt = 0; attempt < 20; attempt += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(redirects).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('en modo OIDC no se puede usar el login de desarrollo', async () => {
    const { auth } = setup([]);
    await expect(auth.signIn({ email: 'x@ayni.pe', roles: ['operations'] })).rejects.toThrow(
      AppError,
    );
  });

  it('en una ventana privada redirige igual, y la vuelta falla de forma controlada', async () => {
    // Con el almacenamiento bloqueado no hay dónde guardar el verificador: el flujo no se puede
    // completar, pero tampoco debe romper la pantalla.
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('almacenamiento bloqueado');
    });
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('almacenamiento bloqueado');
    });
    const { auth, redirects } = setup([discovery()]);

    auth.initiateFlow('/kyc');
    const url = await waitForRedirect(redirects);
    expect(url.searchParams.get('code_challenge')).toMatch(/^[\w-]{43}$/);

    await expect(
      auth.handleCallback('code-1', required(url.searchParams.get('state'), 'el state')),
    ).rejects.toMatchObject({ kind: 'unauthorized' });

    setItem.mockRestore();
    getItem.mockRestore();
  });
});

describe('OidcStaffAuth: vuelta del proveedor', () => {
  /** Deja el flujo iniciado y devuelve el `state` con el que el proveedor vuelve. */
  async function startedFlow(replies: Reply[]) {
    const context = setup([discovery(), ...replies]);
    context.auth.initiateFlow();
    const url = await waitForRedirect(context.redirects);
    return { ...context, state: required(url.searchParams.get('state'), 'el state') };
  }

  it('intercambia el código por un token con el verificador y devuelve el perfil', async () => {
    const { auth, calls, state, tokens } = await startedFlow([
      { status: 200, body: { access_token: 'staff-token' } },
      apiOk(STAFF_ME),
    ]);
    const verifier = required(sessionStorage.getItem('oidc_code_verifier'), 'el verificador');

    await expect(auth.handleCallback('code-1', state)).resolves.toEqual({
      staffId: STAFF_ME.staffId,
      email: STAFF_ME.email,
      // El rol que esta versión no conoce se ignora.
      roles: ['operations'],
      authenticatedAt: new Date(STAFF_ME.authenticatedAt),
    });

    const exchange = required(calls[1], 'el intercambio del codigo');
    expect(exchange.url).toBe(`${ISSUER}/token`);
    const body = new URLSearchParams(exchange.init.body as string);
    expect(Object.fromEntries(body)).toEqual({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      code: 'code-1',
      code_verifier: verifier,
    });
    expect(tokens.get()).toBe('staff-token');
    // El verificador y el state son de un solo uso.
    expect(sessionStorage.getItem('oidc_code_verifier')).toBeNull();
    expect(sessionStorage.getItem('oidc_state')).toBeNull();
  });

  it('rechaza un state que no es el del flujo (CSRF) sin pedir el token', async () => {
    const { auth, calls, state } = await startedFlow([]);
    await expect(auth.handleCallback('code-1', `${state}-ajeno`)).rejects.toMatchObject({
      kind: 'unauthorized',
    });
    expect(calls).toHaveLength(1);
  });

  it('rechaza la vuelta si no hay flujo iniciado en esta pestaña', async () => {
    const { auth } = setup([]);
    await expect(auth.handleCallback('code-1', 'state-1')).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });

  it('traduce el rechazo del proveedor al pedir el token', async () => {
    const { auth, state } = await startedFlow([{ status: 400, body: { error: 'invalid_grant' } }]);
    await expect(auth.handleCallback('code-1', state)).rejects.toThrow(
      /No se pudo intercambiar el código/,
    );
  });

  it('falla si el proveedor responde sin access_token', async () => {
    const { auth, state, tokens } = await startedFlow([{ status: 200, body: { id_token: 'x' } }]);
    await expect(auth.handleCallback('code-1', state)).rejects.toThrow(
      /no devolvió un access_token/,
    );
    expect(tokens.get()).toBeNull();
  });

  it('falla si con el token el backend no reconoce al personal', async () => {
    const { auth, state } = await startedFlow([
      { status: 200, body: { access_token: 'staff-token' } },
      apiFail(401, 'UNAUTHORIZED'),
    ]);
    await expect(auth.handleCallback('code-1', state)).rejects.toThrow(/perfil del personal/);
  });
});

describe('OidcStaffAuth: sesión', () => {
  it('sin token no consulta el backend', async () => {
    const { auth, calls } = setup([]);
    await expect(auth.current()).resolves.toBeNull();
    expect(calls).toEqual([]);
  });

  it('con el token devuelve el perfil del personal', async () => {
    const { auth, tokens } = setup([apiOk(STAFF_ME)]);
    tokens.set('staff-token');
    await expect(auth.current()).resolves.toMatchObject({ staffId: STAFF_ME.staffId });
  });

  it('si el token dejó de valer, lo descarta y deja la sesión cerrada', async () => {
    const { auth, tokens } = setup([apiFail(401, 'UNAUTHORIZED')]);
    tokens.set('staff-token');
    await expect(auth.current()).resolves.toBeNull();
    expect(tokens.get()).toBeNull();
  });

  it('propaga los errores que no son de autenticación', async () => {
    const { auth, tokens } = setup([apiFail(503, 'UNAVAILABLE')]);
    tokens.set('staff-token');
    await expect(auth.current()).rejects.toMatchObject({ kind: 'server' });
    expect(tokens.get()).toBe('staff-token');
  });

  it('al cerrar sesión borra el token y cierra también la del proveedor', async () => {
    const { auth, redirects, tokens } = setup([discovery()]);
    tokens.set('staff-token');
    auth.signOut();
    expect(tokens.get()).toBeNull();
    const url = await waitForRedirect(redirects);
    expect(url.origin + url.pathname).toBe(`${ISSUER}/logout`);
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
  });

  it('si el proveedor no publica end_session_endpoint, solo borra el token local', async () => {
    const { auth, redirects, tokens } = setup([
      discovery({
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
      }),
    ]);
    tokens.set('staff-token');
    auth.signOut();
    for (let attempt = 0; attempt < 20; attempt += 1) await Promise.resolve();
    expect(tokens.get()).toBeNull();
    expect(redirects).toEqual([]);
  });

  it('si falla el descubrimiento al cerrar sesión, la sesión local queda cerrada igual', async () => {
    const { auth, redirects, tokens } = setup([{ status: 500, body: {} }]);
    tokens.set('staff-token');
    auth.signOut();
    for (let attempt = 0; attempt < 20; attempt += 1) await Promise.resolve();
    expect(tokens.get()).toBeNull();
    expect(redirects).toEqual([]);
  });
});
