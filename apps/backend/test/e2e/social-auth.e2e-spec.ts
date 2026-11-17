import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import {
  IDENTITY_PROVIDERS_PORT,
  type IdentityProviderPort,
  type IdentityProvidersPort,
} from '@src/modules/auth/application/ports/social-auth.ports';
import {
  type IdentityProvider,
  type VerifiedIdentity,
} from '@src/modules/auth/domain/entities/external-identity';
import { UnauthorizedError } from '@src/shared/errors/app-error';
import { createTestApp } from '@test/support/create-test-app';

/**
 * Login con Google y Apple (COPAYNI-91). La verificación criptográfica tiene sus pruebas
 * unitarias; aquí se comprueba lo que pasa con la cuenta y la sesión, sin salir a los proveedores.
 */
const NONCE = 'nonce-de-prueba-suficientemente-largo';
/** El DTO exige un token con pinta de JWT; el contenido lo resuelve el proveedor falso. */
const ID_TOKEN = 'cabecera.contenido.firma-de-prueba';

/** Devuelve la identidad que le digan, o rechaza como lo haría un token inválido. */
class FakeProviders implements IdentityProvidersPort {
  next: VerifiedIdentity | null = null;
  fail = false;

  of(provider: IdentityProvider): IdentityProviderPort {
    return {
      provider,
      isConfigured: () => true,
      verify: () => {
        if (this.fail || !this.next) {
          return Promise.reject(new UnauthorizedError('No pudimos verificar tu cuenta'));
        }
        return Promise.resolve({ ...this.next, provider });
      },
    };
  }
}

describe('Login social', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const providers = new FakeProviders();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({
      verifier: null,
      overrides: [{ token: IDENTITY_PROVIDERS_PORT, value: providers }],
    });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    providers.fail = false;
    providers.next = null;
  });

  const identity = (overrides: Partial<VerifiedIdentity> = {}): VerifiedIdentity => ({
    provider: 'google',
    subject: `google-${randomUUID()}`,
    email: `${randomUUID()}@mail.com`,
    privateEmail: false,
    firstName: 'Juana',
    lastName: 'Torres',
    ...overrides,
  });

  const loginWith = (value: VerifiedIdentity, provider: 'google' | 'apple' = 'google') => {
    providers.next = value;
    return http().post(`/v1/auth/social/${provider}`).send({ idToken: ID_TOKEN, nonce: NONCE });
  };

  it('el primer inicio crea la cuenta y devuelve una sesión de Ayni', async () => {
    const value = identity();
    const response = await loginWith(value).expect(200);

    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.data.refreshToken).toEqual(expect.any(String));
    // La sesión es la de siempre: sirve para el resto de la API.
    const me = await http()
      .get('/v1/me')
      .set('Authorization', `Bearer ${response.body.data.accessToken as string}`)
      .expect(200);
    expect(me.body.data.email).toBe(value.email);

    const rows = await database.query<{ provider: string; subject: string }[]>(
      'SELECT provider, subject FROM external_identities WHERE subject = $1',
      [value.subject],
    );
    expect(rows).toHaveLength(1);
  });

  it('QA-08 el segundo inicio recupera la misma cuenta, sin duplicar nada', async () => {
    const value = identity();
    const first = await loginWith(value).expect(200);
    const second = await loginWith(value).expect(200);

    const meOf = async (token: string): Promise<string> => {
      const me = await http().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
      return me.body.data.id as string;
    };
    expect(await meOf(second.body.data.accessToken as string)).toBe(
      await meOf(first.body.data.accessToken as string),
    );

    const rows = await database.query<unknown[]>(
      'SELECT 1 FROM external_identities WHERE subject = $1',
      [value.subject],
    );
    expect(rows).toHaveLength(1);
  });

  it('QA-11 Apple sin correo en inicios posteriores resuelve por provider + sub', async () => {
    const value = identity({ provider: 'apple', subject: `apple-${randomUUID()}` });
    const first = await loginWith(value, 'apple').expect(200);
    // Apple deja de mandar el correo: la cuenta se encuentra igual.
    const second = await loginWith({ ...value, email: null }, 'apple').expect(200);

    const meOf = async (token: string): Promise<string> => {
      const me = await http().get('/v1/me').set('Authorization', `Bearer ${token}`).expect(200);
      return me.body.data.id as string;
    };
    expect(await meOf(second.body.data.accessToken as string)).toBe(
      await meOf(first.body.data.accessToken as string),
    );
  });

  it('QA-10 dos primeros inicios a la vez dejan una sola cuenta', async () => {
    const value = identity();
    providers.next = value;
    const [first, second] = await Promise.all([
      http().post('/v1/auth/social/google').send({ idToken: ID_TOKEN, nonce: NONCE }),
      http().post('/v1/auth/social/google').send({ idToken: ID_TOKEN, nonce: NONCE }),
    ]);

    expect([first.status, second.status]).toEqual([200, 200]);
    const rows = await database.query<unknown[]>(
      'SELECT 1 FROM external_identities WHERE subject = $1',
      [value.subject],
    );
    expect(rows).toHaveLength(1);
    const users = await database.query<unknown[]>('SELECT 1 FROM users WHERE email = $1', [
      value.email,
    ]);
    expect(users).toHaveLength(1);
  });

  it('QA-12 si el correo ya es de otra cuenta, no vincula sola y lo explica', async () => {
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const email = (
      await database.query<{ email: string }[]>(
        'SELECT u.email FROM users u JOIN auth_challenges c ON c.user_id = u.id WHERE c.id = $1',
        [started.body.data.challengeId],
      )
    )[0]!.email;

    const response = await loginWith(identity({ email })).expect(409);
    expect(response.body.error.code).toBe('SOCIAL_EMAIL_TAKEN');
    expect(response.body.error.message).toMatch(/vincula el proveedor desde tu perfil/i);
  });

  it('QA-04 un token que el proveedor no reconoce no abre sesión', async () => {
    providers.fail = true;
    await http()
      .post('/v1/auth/social/google')
      .send({ idToken: ID_TOKEN, nonce: NONCE })
      .expect(401);
  });

  it('exige nonce e idToken, y solo admite proveedores conocidos', async () => {
    await http().post('/v1/auth/social/google').send({ idToken: ID_TOKEN }).expect(400);
    await http().post('/v1/auth/social/google').send({ nonce: NONCE }).expect(400);
    providers.next = identity();
    await http()
      .post('/v1/auth/social/facebook')
      .send({ idToken: ID_TOKEN, nonce: NONCE })
      .expect(404);
  });

  describe('vincular desde el perfil', () => {
    async function session(): Promise<string> {
      const value = identity();
      const response = await loginWith(value).expect(200);
      return response.body.data.accessToken as string;
    }

    it('vincula Apple a la cuenta con sesión y lo muestra en el perfil', async () => {
      const token = await session();
      providers.next = identity({ provider: 'apple', subject: `apple-${randomUUID()}` });
      await http()
        .post('/v1/me/social-identities/apple')
        .set('Authorization', `Bearer ${token}`)
        .send({ idToken: ID_TOKEN, nonce: NONCE })
        .expect(204);

      const list = await http()
        .get('/v1/me/social-identities')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const linked = (list.body.data.identities as { provider: string }[]).map(
        (item) => item.provider,
      );
      expect(linked).toEqual(expect.arrayContaining(['google', 'apple']));
    });

    it('no mueve una identidad de una cuenta a otra', async () => {
      const ajena = identity({ provider: 'apple', subject: `apple-${randomUUID()}` });
      await loginWith(ajena, 'apple').expect(200);

      const token = await session();
      providers.next = ajena;
      const response = await http()
        .post('/v1/me/social-identities/apple')
        .set('Authorization', `Bearer ${token}`)
        .send({ idToken: ID_TOKEN, nonce: NONCE })
        .expect(409);
      expect(response.body.error.code).toBe('SOCIAL_IDENTITY_TAKEN');
    });

    it('desvincula, y desvincular algo que no está vinculado es 404', async () => {
      const token = await session();
      await http()
        .delete('/v1/me/social-identities/google')
        .set('Authorization', `Bearer ${token}`)
        .expect(204);
      await http()
        .delete('/v1/me/social-identities/google')
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('vincular y listar exigen sesión', async () => {
      await http().get('/v1/me/social-identities').expect(401);
      await http()
        .post('/v1/me/social-identities/google')
        .send({ idToken: ID_TOKEN, nonce: NONCE })
        .expect(401);
    });
  });

  describe('flujo web de Apple en Android', () => {
    it('abre el intento con state y nonce, y la URL apunta a Apple', async () => {
      const response = await http().post('/v1/auth/social/apple/authorize').expect(200);
      const url = new URL(response.body.data.authorizationUrl);

      expect(url.origin + url.pathname).toBe('https://appleid.apple.com/auth/authorize');
      expect(url.searchParams.get('response_mode')).toBe('form_post');
      expect(url.searchParams.get('state')).toBe(response.body.data.state);
      expect(url.searchParams.get('nonce')).toEqual(expect.any(String));

      const rows = await database.query<{ nonce: string }[]>(
        'SELECT nonce FROM social_auth_flows WHERE state = $1',
        [response.body.data.state],
      );
      // El nonce se guarda en el servidor: el dispositivo no lo elige.
      expect(rows[0]?.nonce).toBe(url.searchParams.get('nonce'));
    });

    it('la vuelta devuelve un código interno y la app lo canjea una sola vez (QA-14)', async () => {
      const value = identity({ provider: 'apple', subject: `apple-${randomUUID()}` });
      const start = await http().post('/v1/auth/social/apple/authorize').expect(200);
      providers.next = value;

      const callback = await http()
        .post('/v1/auth/social/apple/callback')
        .send({ state: start.body.data.state, id_token: ID_TOKEN })
        .expect(302);
      const location = String(callback.headers.location);
      const redirect = new URL(location);
      expect(redirect.protocol).toBe('ayni:');
      const code = redirect.searchParams.get('code') ?? '';
      // Por el deep link no viaja ningún token de sesión.
      expect(location).not.toMatch(/accessToken|refreshToken/);

      const exchanged = await http()
        .post('/v1/auth/social/apple/exchange')
        .send({ code })
        .expect(200);
      expect(exchanged.body.data.accessToken).toEqual(expect.any(String));

      await http().post('/v1/auth/social/apple/exchange').send({ code }).expect(401);
    });

    it('QA-17 un state desconocido o repetido no completa el inicio', async () => {
      providers.next = identity({ provider: 'apple', subject: `apple-${randomUUID()}` });
      await http()
        .post('/v1/auth/social/apple/callback')
        .send({ state: 'state-que-nadie-abrio', id_token: ID_TOKEN })
        .expect(401);

      const start = await http().post('/v1/auth/social/apple/authorize').expect(200);
      await http()
        .post('/v1/auth/social/apple/callback')
        .send({ state: start.body.data.state, id_token: ID_TOKEN })
        .expect(302);
      await http()
        .post('/v1/auth/social/apple/callback')
        .send({ state: start.body.data.state, id_token: ID_TOKEN })
        .expect(401);
    });

    it('QA-13 si la persona cancela, vuelve a la app sin sesión', async () => {
      const start = await http().post('/v1/auth/social/apple/authorize').expect(200);
      const response = await http()
        .post('/v1/auth/social/apple/callback')
        .send({ state: start.body.data.state, error: 'user_cancelled_authorize' })
        .expect(302);
      expect(response.headers.location).toContain('error=cancelled');
    });
  });
});
