import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import {
  claimString,
  isVerifiedEmail,
  nonceMatches,
  SocialTokenError,
  verifyIdToken,
} from '@src/modules/auth/infrastructure/social/id-token';
import { type JwksPort } from '@src/shared/infrastructure/crypto/http-jwks';

/**
 * Verificación del ID token de un proveedor OIDC (COPAYNI-91 §11). Cada caso es un rechazo que,
 * de no estar, dejaría entrar a alguien: el token del proveedor es la única prueba de identidad
 * en el login social, y aquí se decide si vale.
 */
const NOW = new Date('2026-11-17T15:00:00Z');
const SECONDS = NOW.getTime() / 1000;
const NONCE = 'n0nce-de-este-intento';

const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 });
const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const RSA_KID = 'rsa-key';
const EC_KID = 'ec-key';

const jwks: JwksPort = {
  key: (kid: string) =>
    Promise.resolve(kid === RSA_KID ? rsa.publicKey : kid === EC_KID ? ec.publicKey : null),
};

const EXPECTED = {
  issuers: ['https://accounts.google.com', 'accounts.google.com'],
  audiences: ['android.apps.googleusercontent.com', 'ios.apps.googleusercontent.com'],
};

const segment = (value: unknown): string =>
  Buffer.from(JSON.stringify(value)).toString('base64url');

function token(
  claims: unknown,
  options: { alg?: string; kid?: string | null; signWith?: 'rsa' | 'ec'; header?: unknown } = {},
): string {
  const alg = options.alg ?? 'RS256';
  const header =
    options.header ??
    (options.kid === null ? { alg, typ: 'JWT' } : { alg, kid: options.kid ?? RSA_KID, typ: 'JWT' });
  const input = `${segment(header)}.${segment(claims)}`;
  const con = options.signWith ?? 'rsa';
  const signature =
    con === 'ec'
      ? sign('sha256', Buffer.from(input), { key: ec.privateKey, dsaEncoding: 'ieee-p1363' })
      : sign('sha256', Buffer.from(input), rsa.privateKey);
  return `${input}.${signature.toString('base64url')}`;
}

const claims = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  iss: 'https://accounts.google.com',
  aud: 'android.apps.googleusercontent.com',
  sub: 'google-sub-1',
  exp: SECONDS + 600,
  iat: SECONDS - 10,
  nonce: NONCE,
  ...overrides,
});

const verify = (value: string, nonce = NONCE): Promise<Record<string, unknown>> =>
  verifyIdToken(value, jwks, EXPECTED, nonce, NOW);

/** Todos los rechazos responden lo mismo; el motivo solo va al log. */
const rejectedBecause = async (value: string, reason: string, nonce = NONCE): Promise<void> => {
  await expect(verify(value, nonce)).rejects.toMatchObject({ reason });
  await expect(verify(value, nonce)).rejects.toBeInstanceOf(SocialTokenError);
};

describe('verifyIdToken', () => {
  it('acepta un token bien firmado y devuelve sus claims', async () => {
    await expect(verify(token(claims()))).resolves.toMatchObject({ sub: 'google-sub-1' });
  });

  it('acepta ES256 firmado con la clave de curva elíptica', async () => {
    await expect(
      verify(token(claims(), { alg: 'ES256', kid: EC_KID, signWith: 'ec' })),
    ).resolves.toMatchObject({ sub: 'google-sub-1' });
  });

  describe('formato y cabecera', () => {
    it('rechaza lo que no tiene tres partes', async () => {
      await rejectedBecause('solo.dos', 'formato');
    });

    it('rechaza una parte vacía', async () => {
      await rejectedBecause('abc..def', 'formato');
    });

    it('rechaza una cabecera ilegible', async () => {
      await rejectedBecause('no-es-base64-json.eyJhIjoxfQ.firma', 'cabecera ilegible');
    });

    it('rechaza una cabecera que no es un objeto', async () => {
      await rejectedBecause(`${segment([1, 2])}.${segment(claims())}.firma`, 'cabecera ilegible');
    });

    it('rechaza un algoritmo que no se admite, incluido none', async () => {
      await rejectedBecause(token(claims(), { alg: 'none' }), 'algoritmo');
      await rejectedBecause(token(claims(), { alg: 'HS256' }), 'algoritmo');
    });

    it('rechaza una cabecera sin kid', async () => {
      await rejectedBecause(token(claims(), { kid: null }), 'sin kid');
    });
  });

  describe('clave y firma', () => {
    it('rechaza un kid que el proveedor no publica', async () => {
      await rejectedBecause(token(claims(), { kid: 'otro' }), 'clave');
    });

    // Confusión de algoritmos: decir ES256 y que el JWKS devuelva una clave RSA.
    it('rechaza una clave cuyo tipo no corresponde al algoritmo', async () => {
      await rejectedBecause(token(claims(), { alg: 'ES256', kid: RSA_KID }), 'clave');
    });

    it('rechaza una firma que no verifica', async () => {
      const bueno = token(claims());
      const [header, payload] = bueno.split('.');
      await rejectedBecause(
        `${header}.${payload}.${Buffer.from('falsa').toString('base64url')}`,
        'firma',
      );
    });

    it('rechaza un contenido ilegible aunque la firma cuadre', async () => {
      const header = segment({ alg: 'RS256', kid: RSA_KID, typ: 'JWT' });
      const payload = Buffer.from('no es json').toString('base64url');
      const firma = sign('sha256', Buffer.from(`${header}.${payload}`), rsa.privateKey);
      await rejectedBecause(
        `${header}.${payload}.${firma.toString('base64url')}`,
        'contenido ilegible',
      );
    });
  });

  describe('claims', () => {
    it('rechaza un emisor ajeno o ausente', async () => {
      await rejectedBecause(token(claims({ iss: 'https://evil.example.com' })), 'emisor');
      await rejectedBecause(token(claims({ iss: 42 })), 'emisor');
    });

    it('rechaza un token emitido para otra aplicación', async () => {
      await rejectedBecause(token(claims({ aud: 'otra.app' })), 'audiencia');
      await rejectedBecause(token(claims({ aud: 42 })), 'audiencia');
      await rejectedBecause(token(claims({ aud: ['otra.app', 'y.otra'] })), 'audiencia');
    });

    it('acepta la audiencia cuando llega como lista y una coincide', async () => {
      await expect(
        verify(token(claims({ aud: ['otra.app', 'android.apps.googleusercontent.com'] }))),
      ).resolves.toMatchObject({ sub: 'google-sub-1' });
    });

    it('rechaza un token vencido o sin exp', async () => {
      await rejectedBecause(token(claims({ exp: SECONDS - 61 })), 'vencido');
      await rejectedBecause(token(claims({ exp: undefined })), 'vencido');
      await rejectedBecause(token(claims({ exp: 'pronto' })), 'vencido');
    });

    it('tolera un minuto de desfase de reloj en exp', async () => {
      await expect(verify(token(claims({ exp: SECONDS - 59 })))).resolves.toBeDefined();
    });

    it('rechaza un token que todavía no vale', async () => {
      await rejectedBecause(token(claims({ nbf: SECONDS + 61 })), 'nbf');
      await rejectedBecause(token(claims({ iat: SECONDS + 61 })), 'iat');
    });

    it('acepta nbf e iat dentro de la tolerancia', async () => {
      await expect(
        verify(token(claims({ nbf: SECONDS + 59, iat: SECONDS + 59 }))),
      ).resolves.toBeDefined();
    });

    it('rechaza un token sin sub: sin él no hay a quién identificar', async () => {
      await rejectedBecause(token(claims({ sub: '' })), 'sin sub');
      await rejectedBecause(token(claims({ sub: undefined })), 'sin sub');
    });

    it('rechaza un token de otro intento de inicio de sesión', async () => {
      await rejectedBecause(token(claims()), 'nonce', 'otro-nonce');
      await rejectedBecause(token(claims({ nonce: undefined })), 'nonce');
    });

    it('acepta el nonce en SHA-256, como lo envían algunos SDK', async () => {
      const hash = createHash('sha256').update(NONCE).digest('hex');
      await expect(verify(token(claims({ nonce: hash })))).resolves.toBeDefined();
    });
  });
});

describe('nonceMatches', () => {
  it('no acepta un nonce vacío ni uno que no sea texto', () => {
    expect(nonceMatches('', NONCE)).toBe(false);
    expect(nonceMatches(undefined, NONCE)).toBe(false);
    expect(nonceMatches(42, NONCE)).toBe(false);
  });

  it('acepta el valor tal cual y su hash', () => {
    expect(nonceMatches(NONCE, NONCE)).toBe(true);
    expect(nonceMatches(createHash('sha256').update(NONCE).digest('hex'), NONCE)).toBe(true);
  });
});

describe('lectura de claims', () => {
  it('email_verified llega como booleano o como texto', () => {
    expect(isVerifiedEmail({ email_verified: true })).toBe(true);
    expect(isVerifiedEmail({ email_verified: 'true' })).toBe(true);
    expect(isVerifiedEmail({ email_verified: false })).toBe(false);
    expect(isVerifiedEmail({})).toBe(false);
  });

  it('claimString recorta y descarta lo que no sea texto con contenido', () => {
    expect(claimString({ name: '  Juana  ' }, 'name')).toBe('Juana');
    expect(claimString({ name: '   ' }, 'name')).toBeNull();
    expect(claimString({ name: 42 }, 'name')).toBeNull();
    expect(claimString({}, 'name')).toBeNull();
  });
});
