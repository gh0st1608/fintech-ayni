import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { Period } from '@src/shared/domain/value-objects/period';
import { createTestApp } from '@test/support/create-test-app';

/**
 * `POST /v1/circles/join` (COPAYNI-31) con usuarios reales y las reglas provisionales por
 * defecto: National ID asumido y sin límite mensual. Usa payouts propios para no cruzarse con
 * los círculos de las demás pruebas.
 */
describe('POST /v1/circles/join', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
  });

  afterAll(() => app.close());

  async function signIn(method: string | null = 'bank_transfer'): Promise<string> {
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    const token: string = verified.body.data.accessToken;
    if (method) {
      await request(app.getHttpServer())
        .put('/v1/me/payout-method')
        .set('Authorization', `Bearer ${token}`)
        .send({ method })
        .expect(200);
    }
    return token;
  }

  const join = (
    token: string,
    body: Record<string, unknown>,
    key: string | null = randomUUID(),
  ) => {
    const call = request(app.getHttpServer())
      .post('/v1/circles/join')
      .set('Authorization', `Bearer ${token}`);
    return (key === null ? call : call.set('Idempotency-Key', key)).send(body);
  };

  // 87.500 en 10 meses: cuotas exactas y en un salto del slider.
  const NEW_CIRCLE = { circleId: null, payoutAmount: 8_750_000, months: 10, position: 3 };

  it('abre el círculo nuevo, responde lo mismo al reintentar y lo ofrece a los demás', async () => {
    const ana = await signIn();
    const key = randomUUID();
    const created = await join(ana, NEW_CIRCLE, key).expect(201);
    const startsOn = Period.fromDate(new Date(), 'America/Lima').addMonths(1);

    expect(created.body.data).toMatchObject({
      startsOn: startsOn.toString(),
      payout: { amount: 8_750_000, currency: 'PEN' },
      months: 10,
      position: 3,
      payoutPeriod: startsOn.addMonths(2).toString(),
      type: 'lowest_fees',
      created: true,
    });
    expect(created.body.data.installments).toHaveLength(10);
    const { circleId } = created.body.data as { circleId: string };

    const retry = await join(ana, NEW_CIRCLE, key).expect(200);
    expect(retry.body.data).toEqual({ ...created.body.data, created: false });
    await join(ana, { ...NEW_CIRCLE, position: 4 }, key)
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('IDEMPOTENCY_KEY_REUSED'));

    // fill_oldest (R2): el siguiente usuario recibe ese círculo con el slot 3 ocupado.
    const beto = await signIn();
    const slots = await request(app.getHttpServer())
      .get('/v1/circles/slots')
      .query({ payoutAmount: 8_750_000, months: 10 })
      .set('Authorization', `Bearer ${beto}`)
      .expect(200);
    expect(slots.body.data.circleId).toBe(circleId);
    expect(slots.body.data.slots[2].available).toBe(false);

    await join(beto, { ...NEW_CIRCLE, circleId })
      .expect(409)
      .expect(({ body }) => expect(body.error.code).toBe('SLOT_TAKEN'));
    await join(beto, { ...NEW_CIRCLE, circleId, position: 4 })
      .expect(201)
      .expect(({ body }) => expect(body.data).toMatchObject({ circleId, position: 4 }));
  });

  it('sin método de cobro responde PAYOUT_METHOD_REQUIRED y no reserva nada', async () => {
    const token = await signIn(null);
    const key = randomUUID();
    await join(token, { ...NEW_CIRCLE, payoutAmount: 9_000_000 }, key)
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('PAYOUT_METHOD_REQUIRED'));

    await request(app.getHttpServer())
      .put('/v1/me/payout-method')
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'digital_wallet' })
      .expect(200);
    // La misma clave sirve después de elegir el método: el intento anterior no guardó nada.
    await join(token, { ...NEW_CIRCLE, payoutAmount: 9_000_000 }, key).expect(201);
  });

  it('con la tarjeta prepago, un payout sobre su límite responde PAYOUT_METHOD_LIMIT_EXCEEDED', async () => {
    const token = await signIn('prepaid_card');
    await join(token, { ...NEW_CIRCLE, payoutAmount: 11_000_000 })
      .expect(422)
      .expect(({ body }) => expect(body.error.code).toBe('PAYOUT_METHOD_LIMIT_EXCEEDED'));
  });

  it('valida la Idempotency-Key, el cuerpo y que el círculo exista', async () => {
    const token = await signIn();
    await join(token, NEW_CIRCLE, null)
      .expect(400)
      .expect(({ body }) =>
        expect(body.error).toMatchObject({
          code: 'VALIDATION_ERROR',
          details: { 'Idempotency-Key': 'invalid' },
        }),
      );
    await join(token, NEW_CIRCLE, 'corta').expect(400);
    await join(token, { ...NEW_CIRCLE, circleId: 'nope' }).expect(400);
    await join(token, { ...NEW_CIRCLE, circleId: undefined }).expect(400);
    await join(token, { ...NEW_CIRCLE, months: 7 })
      .expect(400)
      .expect(({ body }) => expect(body.error.details).toEqual({ months: 'not_offered' }));
    await join(token, { ...NEW_CIRCLE, circleId: randomUUID() })
      .expect(404)
      .expect(({ body }) => expect(body.error.code).toBe('CIRCLE_NOT_FOUND'));
  });

  it('sin token responde 401', async () => {
    await request(app.getHttpServer()).post('/v1/circles/join').send(NEW_CIRCLE).expect(401);
  });
});
