import { generateKeyPairSync, verify } from 'node:crypto';

import {
  AppleWebFlowAdapter,
  type AppleWebFlowSettings,
  parseApplePrivateKey,
} from '@src/modules/auth/infrastructure/social/apple-web-flow.adapter';
import { InfrastructureError } from '@src/shared/errors/app-error';
import { TestClock } from '@test/support/create-test-app';

/**
 * Canje del authorization code de Apple (COPAYNI-91 §9). Lo que se comprueba aquí es que el
 * client secret se firme como Apple exige y que ningún fallo de Apple se confunda con un
 * id_token válido: este canje trae la identidad, no la da por buena.
 */
const NOW = new Date('2026-11-17T12:00:00Z');

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const settings = (overrides: Partial<AppleWebFlowSettings> = {}): AppleWebFlowSettings => ({
  tokenUrl: 'https://appleid.apple.com/auth/token',
  teamId: 'TEAM123456',
  keyId: 'KEY1234567',
  serviceId: 'com.ayni.web',
  redirectUri: 'https://backend-ayni.example.com/v1/auth/social/apple/callback',
  privateKey,
  timeoutMs: 5000,
  ...overrides,
});

const okResponse = (body: unknown): Response =>
  ({ ok: true, status: 200, json: () => Promise.resolve(body) }) as Response;

/** El adaptador solo llama a `http(url, init)`, así que basta con esa forma. */
type FakeFetch = (url: string, init: { body?: string }) => Promise<Response>;

function adapter(options: { overrides?: Partial<AppleWebFlowSettings>; http?: FakeFetch }): {
  adapter: AppleWebFlowAdapter;
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
    adapter: new AppleWebFlowAdapter(
      settings(options.overrides),
      new TestClock(NOW),
      http as unknown as typeof fetch,
    ),
    calls,
  };
}

describe('canje del código de Apple', () => {
  it('sin la clave .p8 el flujo queda apagado y no se llama a Apple', async () => {
    const { adapter: apple, calls } = adapter({ overrides: { privateKey: null } });

    expect(apple.isConfigured()).toBe(false);
    await expect(apple.exchange('codigo')).rejects.toThrow(InfrastructureError);
    expect(calls).toHaveLength(0);
  });

  it('sin Services ID tampoco está configurado', () => {
    expect(adapter({ overrides: { serviceId: '' } }).adapter.isConfigured()).toBe(false);
  });

  it('con clave y Services ID está configurado', () => {
    expect(adapter({}).adapter.isConfigured()).toBe(true);
  });

  it('devuelve el id_token que trae Apple', async () => {
    const { adapter: apple, calls } = adapter({});

    await expect(apple.exchange('codigo')).resolves.toBe('el.id.token');
    expect(calls[0]?.url).toBe('https://appleid.apple.com/auth/token');
    expect(calls[0]?.body.get('grant_type')).toBe('authorization_code');
    expect(calls[0]?.body.get('code')).toBe('codigo');
  });

  it('firma el client secret como Apple exige, y la firma verifica con la clave pública', async () => {
    const { adapter: apple, calls } = adapter({});
    await apple.exchange('codigo');

    const secret = calls[0]?.body.get('client_secret') ?? '';
    const [header, payload, signature] = secret.split('.');
    expect(
      JSON.parse(Buffer.from(header ?? '', 'base64url').toString('utf8')) as Record<string, string>,
    ).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });

    const claims = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as Record<
      string,
      string | number
    >;
    const seconds = Math.floor(NOW.getTime() / 1000);
    expect(claims).toEqual({
      iss: 'TEAM123456',
      sub: 'com.ayni.web',
      aud: 'https://appleid.apple.com',
      iat: seconds,
      // Apple no acepta un secreto de más de 6 meses; este dura 5 minutos.
      exp: seconds + 300,
    });

    const firmado = verify(
      'sha256',
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: 'ieee-p1363' },
      Buffer.from(signature ?? '', 'base64url'),
    );
    expect(firmado).toBe(true);
  });

  it('si Apple no responde, falla sin dejar pasar nada', async () => {
    const { adapter: apple } = adapter({
      http: () => Promise.reject(new Error('timeout')),
    });

    await expect(apple.exchange('codigo')).rejects.toThrow('Apple no respondió');
  });

  it('si Apple rechaza el canje, no se confunde con un id_token', async () => {
    const { adapter: apple } = adapter({
      http: () => Promise.resolve({ ok: false, status: 400 } as Response),
    });

    await expect(apple.exchange('codigo')).rejects.toThrow('Apple rechazó el canje');
  });

  it('un cuerpo que no es JSON se trata como respuesta sin id_token', async () => {
    const { adapter: apple } = adapter({
      http: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.reject(new Error('no es JSON')),
        } as unknown as Response),
    });

    await expect(apple.exchange('codigo')).rejects.toThrow('no devolvió el id_token');
  });

  it('un id_token que no es texto se rechaza', async () => {
    const { adapter: apple } = adapter({
      http: () => Promise.resolve(okResponse({ id_token: 42 })),
    });

    await expect(apple.exchange('codigo')).rejects.toThrow('no devolvió el id_token');
  });
});

describe('clave .p8 de Apple', () => {
  it('sin valor, el flujo web queda apagado', () => {
    expect(parseApplePrivateKey(undefined)).toBeNull();
    expect(parseApplePrivateKey('   ')).toBeNull();
  });

  it('acepta el PEM con saltos de línea escapados, como llega de una variable de entorno', () => {
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

    const desdeEntorno = parseApplePrivateKey(pem.replaceAll('\n', String.raw`\n`));

    expect(desdeEntorno).not.toBeNull();
    expect(desdeEntorno?.export({ type: 'pkcs8', format: 'pem' }).toString()).toBe(pem);
  });
});
