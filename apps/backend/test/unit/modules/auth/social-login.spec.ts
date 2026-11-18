import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import {
  type ExternalIdentitiesPort,
  type IdentityProviderPort,
  type IdentityProvidersPort,
} from '@src/modules/auth/application/ports/social-auth.ports';
import {
  LinkSocialIdentityUseCase,
  SocialEmailRequiredError,
  SocialEmailTakenError,
  SocialIdentityTakenError,
  SocialLoginUseCase,
  UnlinkSocialIdentityUseCase,
} from '@src/modules/auth/application/use-cases/social-login.use-cases';
import { type SessionIssuer } from '@src/modules/auth/application/services/session-issuer';
import {
  type ExternalIdentity,
  type VerifiedIdentity,
} from '@src/modules/auth/domain/entities/external-identity';
import {
  AppleIdentityAdapter,
  GoogleIdentityAdapter,
  IdentityProviders,
  ProviderNotConfiguredError,
} from '@src/modules/auth/infrastructure/social/provider.adapters';
import { type JwksPort } from '@src/shared/infrastructure/crypto/http-jwks';
import { type UserRepositoryPort } from '@src/modules/users/application/ports/user-repository.port';
import { TestClock } from '@test/support/create-test-app';

const NOW = new Date('2026-11-17T15:00:00Z');
const NONCE = 'n0nce-de-este-intento-aleatorio';

/** Un proveedor de verdad firma sus tokens: aquí se firma con una clave de prueba. */
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key';

const jwks: JwksPort = {
  key: (kid: string) => Promise.resolve(kid === KID ? publicKey : null),
};

function idToken(claims: Record<string, unknown>, options: { kid?: string; alg?: string } = {}) {
  const header = Buffer.from(
    JSON.stringify({ alg: options.alg ?? 'RS256', kid: options.kid ?? KID, typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const input = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(input), privateKey).toString('base64url');
  return `${input}.${signature}`;
}

const googleClaims = (overrides: Record<string, unknown> = {}) => ({
  iss: 'https://accounts.google.com',
  aud: 'android.apps.googleusercontent.com',
  sub: 'google-sub-1',
  exp: NOW.getTime() / 1000 + 600,
  iat: NOW.getTime() / 1000 - 10,
  nonce: NONCE,
  email: 'Juana@mail.com',
  email_verified: true,
  given_name: 'Juana',
  family_name: 'Torres',
  ...overrides,
});

const appleClaims = (overrides: Record<string, unknown> = {}) => ({
  iss: 'https://appleid.apple.com',
  aud: 'com.ayni.mobile',
  sub: 'apple-sub-1',
  exp: NOW.getTime() / 1000 + 600,
  nonce: NONCE,
  ...overrides,
});

const google = () =>
  new GoogleIdentityAdapter(
    { audiences: ['android.apps.googleusercontent.com', 'ios.apps.googleusercontent.com'] },
    jwks,
    new TestClock(NOW),
  );

const apple = () =>
  new AppleIdentityAdapter({ audiences: ['com.ayni.mobile'] }, jwks, new TestClock(NOW));

describe('verificación del token del proveedor (COPAYNI-91 §11)', () => {
  it('acepta un token bien firmado y toma sub como identificador', async () => {
    await expect(
      google().verify({ idToken: idToken(googleClaims()), nonce: NONCE }),
    ).resolves.toEqual({
      provider: 'google',
      subject: 'google-sub-1',
      email: 'juana@mail.com',
      privateEmail: false,
      firstName: 'Juana',
      lastName: 'Torres',
    });
  });

  it.each([
    ['QA-04 firma de otra clave', { kid: 'otra-clave' }, googleClaims()],
    ['QA-05 token vencido', {}, googleClaims({ exp: NOW.getTime() / 1000 - 3600 })],
    [
      'QA-06 audiencia no autorizada',
      {},
      googleClaims({ aud: 'app-de-otro.apps.googleusercontent.com' }),
    ],
    ['QA-07 emisor incorrecto', {}, googleClaims({ iss: 'https://accounts.evil.com' })],
    ['QA-16 nonce de otro intento', {}, googleClaims({ nonce: 'otro-nonce-cualquiera' })],
    ['sin nonce', {}, googleClaims({ nonce: undefined })],
    ['sin sub', {}, googleClaims({ sub: '' })],
  ])('rechaza %s', async (_caso, options, claims) => {
    await expect(
      google().verify({ idToken: idToken(claims, options), nonce: NONCE }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rechaza un token sin firma aunque el contenido parezca válido', async () => {
    const [header, payload] = idToken(googleClaims()).split('.');
    await expect(
      google().verify({ idToken: `${header}.${payload}.`, nonce: NONCE }),
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('acepta el nonce en SHA-256, por si el SDK envía el hash al proveedor', async () => {
    const hashed = createHash('sha256').update(NONCE).digest('hex');
    await expect(
      apple().verify({ idToken: idToken(appleClaims({ nonce: hashed })), nonce: NONCE }),
    ).resolves.toMatchObject({ subject: 'apple-sub-1' });
  });

  it('un correo sin verificar no se toma como correo de la cuenta', async () => {
    await expect(
      google().verify({
        idToken: idToken(googleClaims({ email_verified: false })),
        nonce: NONCE,
      }),
    ).resolves.toMatchObject({ email: null });
  });

  it('QA-11 Apple sin correo se resuelve igual: el sub es lo que manda', async () => {
    await expect(
      apple().verify({ idToken: idToken(appleClaims()), nonce: NONCE }),
    ).resolves.toEqual({
      provider: 'apple',
      subject: 'apple-sub-1',
      email: null,
      privateEmail: false,
      firstName: null,
      lastName: null,
    });
  });

  it('marca el correo privado de "Ocultar mi correo"', async () => {
    await expect(
      apple().verify({
        idToken: idToken(
          appleClaims({
            email: 'abc@privaterelay.appleid.com',
            email_verified: 'true',
            is_private_email: 'true',
          }),
        ),
        nonce: NONCE,
      }),
    ).resolves.toMatchObject({ email: 'abc@privaterelay.appleid.com', privateEmail: true });
  });

  it('un proveedor sin client id configurados queda apagado', () => {
    const providers = new IdentityProviders([
      new GoogleIdentityAdapter({ audiences: [] }, jwks, new TestClock(NOW)),
    ]);
    expect(() => providers.of('google')).toThrow(ProviderNotConfiguredError);
  });
});

/** Alta y recuperación de cuentas (COPAYNI-91 §8). */
describe('inicio de sesión social', () => {
  const verified: VerifiedIdentity = {
    provider: 'google',
    subject: 'google-sub-1',
    email: 'juana@mail.com',
    privateEmail: false,
    firstName: 'Juana',
    lastName: 'Torres',
  };

  const identity = (overrides: Partial<ExternalIdentity> = {}): ExternalIdentity => ({
    id: 'ext-1',
    userId: 'user-1',
    provider: 'google',
    subject: 'google-sub-1',
    email: 'juana@mail.com',
    createdAt: NOW,
    lastLoginAt: null,
    ...overrides,
  });

  function setup(
    options: {
      existing?: ExternalIdentity | null;
      owner?: boolean;
      verified?: VerifiedIdentity;
    } = {},
  ) {
    const adapter: IdentityProviderPort = {
      provider: 'google',
      isConfigured: () => true,
      verify: jest.fn(() => Promise.resolve(options.verified ?? verified)),
    };
    const providers: IdentityProvidersPort = { of: () => adapter, configured: () => ['google'] };
    const identities = {
      find: jest.fn(() => Promise.resolve(options.existing ?? null)),
      ofUser: jest.fn(() => Promise.resolve([])),
      registerWithUser: jest.fn(() => Promise.resolve(identity({ userId: 'user-nuevo' }))),
      link: jest.fn(() => Promise.resolve(identity())),
      unlink: jest.fn(() => Promise.resolve(true)),
      touch: jest.fn(() => Promise.resolve()),
    } as unknown as ExternalIdentitiesPort;
    const users = {
      findByIdentifier: jest.fn(() =>
        Promise.resolve(options.owner ? { id: 'otra-cuenta' } : null),
      ),
    } as unknown as UserRepositoryPort;
    const sessions = {
      issue: jest.fn((userId: string) =>
        Promise.resolve({ accessToken: `access-${userId}`, refreshToken: 'refresh' }),
      ),
    } as unknown as SessionIssuer;
    const clock = new TestClock(NOW);
    return {
      identities,
      users,
      sessions,
      adapter,
      login: new SocialLoginUseCase(providers, identities, users, sessions, clock),
      link: new LinkSocialIdentityUseCase(providers, identities, clock),
      unlink: new UnlinkSocialIdentityUseCase(identities),
    };
  }

  const input = { provider: 'google' as const, idToken: 'token', nonce: NONCE };

  it('QA-08 con la identidad ya vinculada, recupera su cuenta sin crear otra', async () => {
    const { login, identities, sessions } = setup({ existing: identity() });
    await expect(login.execute(input)).resolves.toMatchObject({ accessToken: 'access-user-1' });
    expect(identities.registerWithUser).not.toHaveBeenCalled();
    expect(identities.touch).toHaveBeenCalledWith('ext-1', NOW);
    expect(sessions.issue).toHaveBeenCalledWith('user-1');
  });

  it('QA-09 en el primer inicio crea usuario e identidad de una sola vez', async () => {
    const { login, identities } = setup();
    await expect(login.execute(input)).resolves.toMatchObject({ accessToken: 'access-user-nuevo' });
    expect(identities.registerWithUser).toHaveBeenCalledWith({
      identity: verified,
      email: 'juana@mail.com',
      at: NOW,
    });
  });

  it('QA-12 si el correo ya es de otra cuenta, no vincula solo', async () => {
    const { login, identities } = setup({ owner: true });
    await expect(login.execute(input)).rejects.toBeInstanceOf(SocialEmailTakenError);
    expect(identities.registerWithUser).not.toHaveBeenCalled();
  });

  it('sin correo del proveedor no se puede abrir la cuenta, y lo explica', async () => {
    const { login } = setup({ verified: { ...verified, email: null } });
    await expect(login.execute(input)).rejects.toBeInstanceOf(SocialEmailRequiredError);
  });

  it('la sesión la emite el mecanismo de siempre: el token del proveedor no es la sesión', async () => {
    const { login, sessions } = setup({ existing: identity() });
    const tokens = await login.execute(input);
    expect(sessions.issue).toHaveBeenCalledTimes(1);
    expect(tokens.refreshToken).toBe('refresh');
  });

  it('vincular exige sesión y no mueve una identidad de cuenta', async () => {
    const ajena = setup({ existing: identity({ userId: 'otra-persona' }) });
    await expect(ajena.link.execute('user-1', input)).rejects.toBeInstanceOf(
      SocialIdentityTakenError,
    );

    const propia = setup({ existing: identity({ userId: 'user-1' }) });
    // Repetir la vinculación no es un error ni duplica nada.
    await expect(propia.link.execute('user-1', input)).resolves.toBeUndefined();
    expect(propia.identities.link).not.toHaveBeenCalled();

    const nueva = setup();
    await nueva.link.execute('user-1', input);
    expect(nueva.identities.link).toHaveBeenCalledWith('user-1', verified, NOW);
  });

  it('desvincular algo que no estaba vinculado es un 404', async () => {
    const { unlink, identities } = setup();
    (identities.unlink as jest.Mock).mockResolvedValueOnce(false);
    await expect(unlink.execute('user-1', 'apple')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
