import './support/high-rate-limit';

import { randomInt, randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

/** Un DNI de prueba distinto en cada corrida (la base de pruebas se conserva). */
const randomDni = (): string => String(randomInt(20_000_000, 99_999_999));

/**
 * Verificación de identidad (COPAYNI-42) con el proveedor simulado: Consulta coincide salvo con
 * los DNI de prueba y la sesión biométrica se aprueba en cuanto se consulta.
 */
describe('Verificación de identidad', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
  });

  afterAll(() => app.close());

  async function signIn(profile = { firstName: 'Juana', lastName: 'Torres' }): Promise<string> {
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const token = (
      await request(app.getHttpServer())
        .post('/v1/auth/verify')
        .send({ challengeId: started.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
    await request(app.getHttpServer())
      .patch('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send(profile)
      .expect(200);
    return token;
  }

  const get = (token: string) =>
    request(app.getHttpServer())
      .get('/v1/me/identity-verification')
      .set('Authorization', `Bearer ${token}`);
  const start = (token: string, documentNumber: string, consentVersion = '2026-11') =>
    request(app.getHttpServer())
      .post('/v1/me/identity-verification')
      .set('Authorization', `Bearer ${token}`)
      .send({ documentNumber, consentVersion });

  it('Consulta, CheckMatch y resultado: la identidad queda verificada', async () => {
    const token = await signIn();
    expect((await get(token).expect(200)).body.data).toEqual({
      status: 'not_started',
      consentVersion: '2026-11',
      id: null,
      documentNumber: null,
      reason: null,
      message: null,
      verificationUrl: null,
      createdAt: null,
      decidedAt: null,
    });

    const dni = randomDni();
    const started = (await start(token, dni).expect(200)).body.data;
    expect(started).toMatchObject({
      status: 'in_progress',
      documentNumber: `•••••${dni.slice(-3)}`,
      verificationUrl: expect.stringContaining('https://'),
      decidedAt: null,
    });
    // Al volver del flujo, la app consulta y el proveedor ya resolvió.
    expect((await get(token).expect(200)).body.data).toMatchObject({
      id: started.id,
      status: 'approved',
      verificationUrl: null,
      decidedAt: expect.any(String),
    });
    const again = await start(token, dni).expect(409);
    expect(again.body.error.code).toBe('IDENTITY_ALREADY_VERIFIED');

    // El mismo DNI no se puede verificar en otra cuenta.
    const other = await signIn();
    expect((await start(other, dni).expect(200)).body.data).toMatchObject({
      status: 'rejected',
      reason: 'document_in_use',
      message: 'Ese DNI ya está verificado en otra cuenta',
    });
  });

  it('un DNI inexistente o de otra persona se rechaza con motivo', async () => {
    const token = await signIn();
    expect((await start(token, '00000000').expect(200)).body.data).toMatchObject({
      status: 'rejected',
      reason: 'document_not_found',
      verificationUrl: null,
    });
    expect((await start(token, '11111111').expect(200)).body.data).toMatchObject({
      status: 'rejected',
      reason: 'data_mismatch',
    });
  });

  it('valida el DNI, el consentimiento y el perfil', async () => {
    const token = await signIn();
    const invalid = await start(token, '1234').expect(400);
    expect(invalid.body.error.details).toEqual({ documentNumber: 'invalid' });
    const outdated = await start(token, randomDni(), '2020-01').expect(400);
    expect(outdated.body.error.details).toEqual({ consentVersion: 'outdated' });

    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const withoutName = (
      await request(app.getHttpServer())
        .post('/v1/auth/verify')
        .send({ challengeId: started.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
    const incomplete = await start(withoutName, randomDni()).expect(422);
    expect(incomplete.body.error).toMatchObject({
      code: 'IDENTITY_PROFILE_INCOMPLETE',
      details: { firstName: 'required', lastName: 'required' },
    });
  });

  it('el webhook sin el token configurado se rechaza', async () => {
    await request(app.getHttpServer())
      .post('/v1/webhooks/verificaid?token=cualquiera')
      .send({ event_type: 'kyc.updated', payload: { id: 'x' } })
      .expect(401);
  });
});
