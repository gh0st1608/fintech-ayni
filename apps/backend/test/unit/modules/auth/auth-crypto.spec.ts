import { createPrivateKey, generateKeyPairSync, sign } from 'node:crypto';

import {
  Es256JwtIssuer,
  Es256JwtVerifier,
  type JwtSettings,
  parsePrivateKey,
} from '@src/modules/auth/infrastructure/crypto/es256-jwt';
import {
  CryptoRefreshTokenSecrets,
  DevOtpSender,
  FixedOtpGenerator,
  HmacOtpHasher,
  RandomOtpGenerator,
  UnavailableOtpSender,
} from '@src/modules/auth/infrastructure/crypto/otp.adapters';
import { TestClock } from '@test/support/create-test-app';

const USER_ID = '6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f';

const settings = (overrides: Partial<JwtSettings> = {}): JwtSettings => ({
  privateKey: generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey,
  keyId: 'ayni-1',
  issuer: 'ayni-api',
  audience: 'ayni-mobile',
  ttlSeconds: 900,
  ...overrides,
});

const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

describe('JWT ES256', () => {
  const clock = new TestClock();
  const jwt = settings();
  const issuer = new Es256JwtIssuer(jwt, clock);
  const verifier = new Es256JwtVerifier(jwt, clock);

  it('emite un token que el verificador acepta, con los claims del contrato', async () => {
    const token = issuer.issue(USER_ID);
    const [header, payload] = token.split('.');

    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'ES256',
      typ: 'JWT',
      kid: 'ayni-1',
    });
    expect(JSON.parse(Buffer.from(payload!, 'base64url').toString())).toMatchObject({
      sub: USER_ID,
      iss: 'ayni-api',
      aud: 'ayni-mobile',
      exp: expect.any(Number),
    });
    await expect(verifier.verify(token)).resolves.toEqual({ userId: USER_ID });
  });

  it('rechaza un token vencido (con 30 s de tolerancia)', async () => {
    const token = issuer.issue(USER_ID);
    const later = new TestClock(new Date(clock.now().getTime() + 929_000));
    await expect(new Es256JwtVerifier(jwt, later).verify(token)).resolves.toBeTruthy();
    later.advanceSeconds(2);
    await expect(new Es256JwtVerifier(jwt, later).verify(token)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('rechaza un token emitido en el futuro', async () => {
    const future = new TestClock(new Date(clock.now().getTime() + 60_000));
    const token = new Es256JwtIssuer(jwt, future).issue(USER_ID);
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it.each([
    ['otra clave', settings()],
    ['otro kid', { ...jwt, keyId: 'ayni-2' }],
    ['otro emisor', { ...jwt, issuer: 'otro' }],
    ['otra audiencia', { ...jwt, audience: 'web' }],
  ])('rechaza un token firmado con %s', async (_case, other) => {
    const token = new Es256JwtIssuer(other, clock).issue(USER_ID);
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rechaza alg none, HS256, un sub que no es uuid, firmas alteradas y basura', async () => {
    const valid = issuer.issue(USER_ID);
    const [header, payload, signature] = valid.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as object;
    const signed = (headerValue: object, claimsValue: object) => {
      const input = `${b64(headerValue)}.${b64(claimsValue)}`;
      const sig = sign('sha256', Buffer.from(input), {
        key: jwt.privateKey,
        dsaEncoding: 'ieee-p1363',
      });
      return `${input}.${sig.toString('base64url')}`;
    };

    const tokens = [
      `${b64({ alg: 'none', kid: 'ayni-1' })}.${payload}.`,
      `${b64({ alg: 'HS256', kid: 'ayni-1' })}.${payload}.${signature}`,
      signed({ alg: 'ES256', kid: 'ayni-1' }, { ...claims, sub: 'admin' }),
      signed({ alg: 'ES256', kid: 'ayni-1' }, { ...claims, exp: 'nunca' }),
      `${header}.${b64({ ...claims, sub: '00000000-0000-0000-0000-000000000000' })}.${signature}`,
      `${header}.${payload}.${signature!.slice(0, -4)}AAAA`,
      'no-es-un-jwt',
      'a.b.c',
    ];
    for (const token of tokens) {
      await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    }
  });

  it('lee la clave PEM, con saltos de línea escapados, y exige P-256', () => {
    const pem = jwt.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    expect(parsePrivateKey(pem.replace(/\n/g, '\\n')).asymmetricKeyType).toBe('ec');

    const p384 = generateKeyPairSync('ec', { namedCurve: 'secp384r1' }).privateKey;
    expect(() => parsePrivateKey(p384.export({ type: 'pkcs8', format: 'pem' }).toString())).toThrow(
      /P-256/,
    );
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
    expect(() => parsePrivateKey(rsa.export({ type: 'pkcs8', format: 'pem' }).toString())).toThrow(
      /P-256/,
    );
    expect(createPrivateKey(pem).asymmetricKeyDetails?.namedCurve).toBe('prime256v1');
  });
});

describe('Adaptadores de OTP y refresh tokens', () => {
  it('genera códigos de 4 dígitos', () => {
    const codes = Array.from({ length: 200 }, () => new RandomOtpGenerator().generate());
    expect(codes.every((code) => /^\d{4}$/.test(code))).toBe(true);
    expect(new FixedOtpGenerator('1234').generate()).toBe('1234');
  });

  it('el hash depende del secreto y del desafío, y compara en tiempo constante', () => {
    const hasher = new HmacOtpHasher('p'.repeat(32));
    const hash = hasher.hash('ch-1', '1234');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hasher.matches('ch-1', '1234', hash)).toBe(true);
    expect(hasher.matches('ch-1', '4321', hash)).toBe(false);
    expect(hasher.matches('ch-2', '1234', hash)).toBe(false);
    expect(new HmacOtpHasher('q'.repeat(32)).matches('ch-1', '1234', hash)).toBe(false);
    expect(hasher.matches('ch-1', '1234', 'corto')).toBe(false);
  });

  it('el envío de desarrollo no falla y el de producción sin proveedor responde 503', async () => {
    await expect(
      new DevOtpSender().send({ channel: 'email', destination: 'a@b.co', code: '1234' }),
    ).resolves.toBeUndefined();
    await expect(new UnavailableOtpSender().send()).rejects.toMatchObject({
      kind: 'infrastructure',
    });
  });

  it('los refresh tokens son aleatorios y se guardan como SHA-256', () => {
    const secrets = new CryptoRefreshTokenSecrets();
    const first = secrets.generate();
    const second = secrets.generate();

    expect(first.token).not.toBe(second.token);
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.tokenHash).toBe(secrets.hashOf(first.token));
    expect(first.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});
