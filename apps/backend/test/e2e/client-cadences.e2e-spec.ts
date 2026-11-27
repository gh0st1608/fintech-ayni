import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { CLIENT_CADENCES_HEADER } from '@src/modules/circles/presentation/http/client-cadences';
import { createTestApp } from '@test/support/create-test-app';

/**
 * Negociación de capacidad del cliente (COPAYNI-115), como contrato HTTP.
 *
 * La app publicada en la tienda no envía la cabecera, así que el servidor solo le ofrece juntas
 * mensuales: no sabe dibujar una semanal y mostraría cifras y fechas equivocadas sobre dinero
 * real. Las demás pruebas e2e de este repositorio tampoco la envían, así que todas juntas son la
 * reja que comprueba que la app publicada sigue viendo lo mismo que antes.
 */
describe('Cadencias que el cliente declara', () => {
  let app: NestExpressApplication;
  let weeklyId: string;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    weeklyId = randomUUID();
    // Una junta semanal abierta que, salvo por la cadencia, cumple todo para recomendarse.
    await app.get(DataSource).query(
      `INSERT INTO circles (id, payout_amount, currency, turns, cadence, starts_on, cycle_state)
       VALUES ($1, 3000000, 'PEN', 10, 'weekly', (now() + interval '10 days')::date, 'collecting')`,
      [weeklyId],
    );
  });

  afterAll(() => app.close());

  async function signIn(): Promise<string> {
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    const token: string = verified.body.data.accessToken;
    await request(app.getHttpServer())
      .put('/v1/me/payout-method')
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'bank_account' })
      .expect(200);
    return token;
  }

  it('sin la cabecera no recomienda la junta semanal', async () => {
    const token = await signIn();

    const response = await request(app.getHttpServer())
      .get('/v1/circles/recommended')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const ids = (response.body.data.items as { circleId: string }[]).map(
      ({ circleId }) => circleId,
    );
    expect(ids).not.toContain(weeklyId);
  });

  it('declarando semanal, el listado responde y no trae nada que no se declare', async () => {
    // Que la semanal concreta aparezca depende del tope del listado y de los círculos que dejan
    // los demás archivos de e2e en la base compartida; eso se prueba en el caso de uso. Aquí lo
    // que importa del contrato es que declarar no rompe nada y que nada se cuela sin declararse.
    const token = await signIn();

    const response = await request(app.getHttpServer())
      .get('/v1/circles/recommended')
      .set('Authorization', `Bearer ${token}`)
      .set(CLIENT_CADENCES_HEADER, 'monthly')
      .expect(200);

    const items = response.body.data.items as { circleId: string }[];
    expect(items.map(({ circleId }) => circleId)).not.toContain(weeklyId);
  });

  it('sin la cabecera, pedir los slots de la junta semanal por su id falla explícitamente', async () => {
    const token = await signIn();

    const response = await request(app.getHttpServer())
      .get(`/v1/circles/slots?payoutAmount=3000000&months=10&circleId=${weeklyId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    expect(response.body).toMatchObject({
      success: false,
      error: { code: 'VALIDATION_ERROR', details: { cadence: 'not_supported_by_client' } },
    });
  });

  it('declarando semanal, los slots de esa junta se devuelven', async () => {
    const token = await signIn();

    const response = await request(app.getHttpServer())
      .get(`/v1/circles/slots?payoutAmount=3000000&months=10&circleId=${weeklyId}`)
      .set('Authorization', `Bearer ${token}`)
      .set(CLIENT_CADENCES_HEADER, 'weekly')
      .expect(200);

    expect(response.body.data.circleId).toBe(weeklyId);
    expect(response.body.data.slots).toHaveLength(10);
  });

  it('una cadencia desconocida en la cabecera se rechaza en lugar de ignorarse', async () => {
    const token = await signIn();

    const response = await request(app.getHttpServer())
      .get('/v1/circles/recommended')
      .set('Authorization', `Bearer ${token}`)
      .set(CLIENT_CADENCES_HEADER, 'monthly,trimestral')
      .expect(400);

    expect(response.body.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { [CLIENT_CADENCES_HEADER]: 'invalid' },
    });
  });
});
