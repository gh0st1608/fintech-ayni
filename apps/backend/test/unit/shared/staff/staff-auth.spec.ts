import { generateKeyPairSync, type KeyObject, sign } from 'node:crypto';

import { Logger } from '@nestjs/common';

import { maskEmail, maskName, maskPhone } from '@src/shared/domain/services/mask-pii';
import { DevStaffTokens } from '@src/shared/infrastructure/staff/dev-staff-tokens';
import {
  HttpJwks,
  OidcStaffAuthenticator,
} from '@src/shared/infrastructure/staff/oidc-staff-authenticator';
import { TestClock } from '@test/support/create-test-app';

const NOW = new Date('2026-11-09T15:00:00Z');
const NOW_SECONDS = NOW.getTime() / 1000;
const ISSUER = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_pool';
const CLIENT_ID = 'backoffice-client';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

function jwt(claims: object, options: { alg?: string; kid?: string; key?: KeyObject } = {}) {
  const alg = options.alg ?? 'RS256';
  const input = `${encode({ alg, kid: options.kid ?? 'k1', typ: 'JWT' })}.${encode(claims)}`;
  const key = options.key ?? rsa.privateKey;
  const signature = sign(
    'sha256',
    Buffer.from(input),
    key.asymmetricKeyType === 'ec' ? { key, dsaEncoding: 'ieee-p1363' } : key,
  );
  return `${input}.${signature.toString('base64url')}`;
}

/** Access token de Cognito: sin `aud`, con `client_id` y los grupos como roles. */
const cognitoClaims = (overrides: object = {}) => ({
  iss: ISSUER,
  sub: 'staff-uuid',
  client_id: CLIENT_ID,
  token_use: 'access',
  'cognito:groups': ['operations', 'unknown-group'],
  auth_time: NOW_SECONDS - 120,
  iat: NOW_SECONDS - 60,
  exp: NOW_SECONDS + 3600,
  ...overrides,
});

function authenticator(keys: Record<string, KeyObject> = { k1: rsa.publicKey }) {
  return new OidcStaffAuthenticator(
    { issuer: ISSUER, audience: CLIENT_ID, rolesClaim: 'cognito:groups' },
    { key: (kid) => Promise.resolve(keys[kid] ?? null) },
    new TestClock(NOW),
  );
}

describe('OidcStaffAuthenticator', () => {
  it('acepta un access token de Cognito y toma los roles conocidos de sus grupos', async () => {
    await expect(authenticator().authenticate(jwt(cognitoClaims()))).resolves.toEqual({
      staffId: 'staff-uuid',
      email: undefined,
      roles: ['operations'],
      authenticatedAt: new Date((NOW_SECONDS - 120) * 1000),
    });
  });

  it('acepta ES256 y la audiencia en `aud`', async () => {
    const token = jwt(
      { ...cognitoClaims(), client_id: undefined, aud: [CLIENT_ID], email: 'ops@ayni.pe' },
      { alg: 'ES256', key: ec.privateKey },
    );
    await expect(authenticator({ k1: ec.publicKey }).authenticate(token)).resolves.toMatchObject({
      email: 'ops@ayni.pe',
    });
  });

  it.each([
    ['otro emisor', jwt(cognitoClaims({ iss: 'https://evil.example' }))],
    ['otra audiencia', jwt(cognitoClaims({ client_id: 'otra-app' }))],
    ['vencido', jwt(cognitoClaims({ exp: NOW_SECONDS - 120 }))],
    ['todavía no válido', jwt(cognitoClaims({ nbf: NOW_SECONDS + 600 }))],
    ['sin sujeto', jwt(cognitoClaims({ sub: '' }))],
    ['clave desconocida', jwt(cognitoClaims(), { kid: 'k2' })],
    [
      'firmado con otra clave',
      jwt(cognitoClaims(), { key: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }),
    ],
    ['alg none', `${encode({ alg: 'none', kid: 'k1' })}.${encode(cognitoClaims())}.x`],
    ['malformado', 'no-es-un-jwt'],
  ])('rechaza un token %s', async (_title, token) => {
    await expect(authenticator().authenticate(token)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rechaza un ES256 verificado con una clave RSA (confusión de algoritmos)', async () => {
    const token = jwt(cognitoClaims(), { alg: 'ES256', key: ec.privateKey });
    await expect(authenticator().authenticate(token)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  describe('mapeo de grupos de Identity Center (groupsMap)', () => {
    const IC_ISSUER = 'https://identitycenter.amazonaws.com/ssoins-722326feeecaf3f6';
    const IC_CLIENT_ID = 'my-backoffice-app';

    const groupsMap = {
      'ayni-prd-administradores': ['admin', 'super_admin', 'operations', 'finance', 'support'],
      'ayni-prd-soporte': ['support', 'operations'],
      'ayni-prd-facturadores': ['finance'],
    } as const;

    function icAuthenticator(keys: Record<string, KeyObject> = { k1: rsa.publicKey }) {
      return new OidcStaffAuthenticator(
        {
          issuer: IC_ISSUER,
          audience: IC_CLIENT_ID,
          rolesClaim: 'cognito:groups',
          groupsMap,
        },
        { key: (kid) => Promise.resolve(keys[kid] ?? null) },
        new TestClock(NOW),
      );
    }

    const icClaims = (groups: string[]) => ({
      iss: IC_ISSUER,
      sub: 'staff-uuid',
      aud: IC_CLIENT_ID,
      'cognito:groups': groups,
      auth_time: NOW_SECONDS - 120,
      iat: NOW_SECONDS - 60,
      exp: NOW_SECONDS + 3600,
    });

    it('traduce ayni-prd-soporte a support y operations (sin duplicados)', async () => {
      const token = jwt(icClaims(['ayni-prd-soporte']));
      await expect(icAuthenticator().authenticate(token)).resolves.toMatchObject({
        roles: expect.arrayContaining(['support', 'operations']),
      });
    });

    it('traduce ayni-prd-administradores a todos los roles de admin', async () => {
      const token = jwt(icClaims(['ayni-prd-administradores']));
      const result = await icAuthenticator().authenticate(token);
      expect(result.roles).toEqual(
        expect.arrayContaining(['admin', 'super_admin', 'operations', 'finance', 'support']),
      );
    });

    it('combina grupos sin duplicar roles (soporte + facturadores → support, operations, finance)', async () => {
      const token = jwt(icClaims(['ayni-prd-soporte', 'ayni-prd-facturadores']));
      const result = await icAuthenticator().authenticate(token);
      expect([...result.roles].sort()).toEqual(['finance', 'operations', 'support'].sort());
    });

    it('un grupo no mapeado (ayni-prd-lectores) produce roles vacíos', async () => {
      const token = jwt(icClaims(['ayni-prd-lectores']));
      await expect(icAuthenticator().authenticate(token)).resolves.toMatchObject({
        roles: [],
      });
    });
  });
});

describe('HttpJwks', () => {
  const jwk = { ...rsa.publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig' };

  function setup(responses: { ok: boolean; status: number; body: unknown }[]) {
    const clock = new TestClock(NOW);
    const fetchFn = jest.fn(() => {
      const next = responses.shift() ?? { ok: false, status: 500, body: {} };
      return Promise.resolve({ ...next, json: () => Promise.resolve(next.body) });
    });
    const jwks = new HttpJwks(
      { url: 'https://idp/jwks', cacheSeconds: 600, minRefreshSeconds: 30 },
      clock,
      fetchFn,
    );
    return { clock, fetchFn, jwks };
  }

  beforeAll(() => jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined));
  afterAll(() => jest.restoreAllMocks());

  it('descarga una vez y reutiliza las claves', async () => {
    const { fetchFn, jwks } = setup([{ ok: true, status: 200, body: { keys: [jwk] } }]);
    expect(await jwks.key('k1')).not.toBeNull();
    expect(await jwks.key('k1')).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('un kid desconocido no descarga más de una vez cada 30 segundos', async () => {
    const { clock, fetchFn, jwks } = setup([
      { ok: true, status: 200, body: { keys: [jwk] } },
      { ok: true, status: 200, body: { keys: [jwk, { ...jwk, kid: 'k2' }] } },
    ]);
    await jwks.key('k1');
    expect(await jwks.key('k2')).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    clock.set(new Date(NOW.getTime() + 31_000));
    expect(await jwks.key('k2')).not.toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('si la descarga falla, conserva las claves que tenía', async () => {
    const { clock, jwks } = setup([
      { ok: true, status: 200, body: { keys: [jwk] } },
      { ok: false, status: 503, body: {} },
    ]);
    await jwks.key('k1');
    clock.set(new Date(NOW.getTime() + 700_000));
    expect(await jwks.key('k1')).not.toBeNull();
  });

  it('ignora claves que no son de firma', async () => {
    const { jwks } = setup([{ ok: true, status: 200, body: { keys: [{ ...jwk, use: 'enc' }] } }]);
    expect(await jwks.key('k1')).toBeNull();
  });
});

describe('DevStaffTokens', () => {
  it('emite tokens que solo valida la misma instancia', async () => {
    const clock = new TestClock(NOW);
    const tokens = new DevStaffTokens(clock);
    const { accessToken, expiresIn } = tokens.issue('ops@ayni.local', ['operations']);
    expect(expiresIn).toBe(3600);
    await expect(tokens.authenticate(accessToken)).resolves.toEqual({
      staffId: 'dev:ops@ayni.local',
      email: 'ops@ayni.local',
      roles: ['operations'],
      authenticatedAt: NOW,
    });
    await expect(new DevStaffTokens(clock).authenticate(accessToken)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('vence a la hora', async () => {
    const clock = new TestClock(NOW);
    const tokens = new DevStaffTokens(clock);
    const { accessToken } = tokens.issue('ops@ayni.local', ['support']);
    clock.set(new Date(NOW.getTime() + 2 * 3600_000));
    await expect(tokens.authenticate(accessToken)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('datos personales enmascarados', () => {
  it.each([
    ['juana.perez@mail.com', 'j***@mail.com'],
    ['sin-arroba', '***'],
  ])('email %s', (email, masked) => expect(maskEmail(email)).toBe(masked));

  it.each([
    ['+51987654321', '+51******321'],
    ['+5112', '***'],
  ])('teléfono %s', (phone, masked) => expect(maskPhone(phone)).toBe(masked));

  it.each([
    ['Juana', 'Pérez', 'Juana P.'],
    ['Juana', null, 'Juana'],
    [null, 'Pérez', 'P.'],
    [null, null, null],
  ])('nombre %s %s', (first, last, masked) => expect(maskName(first, last)).toBe(masked));
});
