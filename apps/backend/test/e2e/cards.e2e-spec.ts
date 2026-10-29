import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

/** `GET` y `POST /v1/me/cards` (COPAYNI-40) con la pasarela simulada y un usuario real. */
describe('/v1/me/cards', () => {
  let app: NestExpressApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    token = verified.body.data.accessToken;
  });

  afterAll(() => app.close());

  const add = (body: object, key: string | null = randomUUID()) => {
    const call = request(app.getHttpServer())
      .post('/v1/me/cards')
      .set('Authorization', `Bearer ${token}`);
    return (key ? call.set('Idempotency-Key', key) : call).send(body);
  };

  it('guarda la tarjeta del token, responde lo mismo al reintentar y la lista', async () => {
    const key = randomUUID();
    const created = await add({ token: 'tok-e2e' }, key).expect(201);
    expect(created.body.data).toEqual({
      id: expect.any(String),
      brand: 'visa',
      lastFour: '4242',
      expirationMonth: 12,
      expirationYear: 2030,
      isDefault: true,
    });
    const retry = await add({ token: 'tok-e2e' }, key).expect(200);
    expect(retry.body.data).toEqual(created.body.data);

    const list = await request(app.getHttpServer())
      .get('/v1/me/cards')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.items).toEqual([created.body.data]);
  });

  it('una tarjeta rechazada por la pasarela responde CARD_REJECTED', async () => {
    const response = await add({ token: 'rejected-e2e' }).expect(422);
    expect(response.body.error.code).toBe('CARD_REJECTED');
  });

  it.each([
    [{ token: 'tok' }, null],
    [{}, 'clave-valida-0000001'],
    [{ token: 'tok', pan: '4111111111111111' }, 'clave-valida-0000002'],
  ])('rechaza %p con VALIDATION_ERROR', async (body, key) => {
    const response = await add(body, key).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('cambia la predeterminada y elimina una tarjeta (COPAYNI-39)', async () => {
    const auth = { Authorization: `Bearer ${token}` };
    const second = await add({ token: 'tok-e2e-2' }).expect(201);
    const id = second.body.data.id as string;
    const updated = await request(app.getHttpServer())
      .put(`/v1/me/cards/${id}/default`)
      .set(auth)
      .expect(200);
    expect(updated.body.data.items[0]).toMatchObject({ id, isDefault: true });

    const others = (updated.body.data.items as { id: string }[]).filter((item) => item.id !== id);
    for (const other of others) {
      await request(app.getHttpServer()).delete(`/v1/me/cards/${other.id}`).set(auth).expect(204);
    }
    await request(app.getHttpServer()).delete(`/v1/me/cards/${id}`).set(auth).expect(204);
    const missing = await request(app.getHttpServer())
      .delete(`/v1/me/cards/${id}`)
      .set(auth)
      .expect(404);
    expect(missing.body.error.code).toBe('CARD_NOT_FOUND');
    const invalid = await request(app.getHttpServer())
      .put('/v1/me/cards/no-es-uuid/default')
      .set(auth)
      .expect(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/me/cards').expect(401);
  });
});
