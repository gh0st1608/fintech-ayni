import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { Period } from '@src/shared/domain/value-objects/period';
import { createTestApp } from '@test/support/create-test-app';

/** `GET` y `PUT /v1/me/payout-method` (COPAYNI-37) con usuarios reales autenticados por OTP. */
describe('/v1/me/payout-method', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
  });

  afterAll(() => app.close());

  async function signIn(): Promise<{ token: string; userId: string }> {
    const http = request(app.getHttpServer());
    const started = await http
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    const token: string = verified.body.data.accessToken;
    const payload = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString()) as {
      sub: string;
    };
    return { token, userId: payload.sub };
  }

  const get = (token: string) =>
    request(app.getHttpServer())
      .get('/v1/me/payout-method')
      .set('Authorization', `Bearer ${token}`);
  const put = (token: string, method: string) =>
    request(app.getHttpServer())
      .put('/v1/me/payout-method')
      .set('Authorization', `Bearer ${token}`)
      .send({ method });

  it('lista el catálogo provisional sin método elegido', async () => {
    const { token } = await signIn();
    const response = await get(token).expect(200);

    expect(response.body.data).toEqual({
      methods: [
        { type: 'digital_wallet', available: true, badges: [], limit: null },
        {
          type: 'prepaid_card',
          available: true,
          badges: ['no_charge'],
          limit: { amount: 10_000_000, currency: 'PEN' },
        },
        { type: 'bank_transfer', available: true, badges: ['no_charge'], limit: null },
      ],
      selected: null,
    });
  });

  it('guarda el método y lo devuelve preseleccionado', async () => {
    const { token } = await signIn();
    await expect(put(token, 'bank_transfer').expect(200)).resolves.toMatchObject({
      body: { data: { selected: 'bank_transfer' } },
    });
    await expect(get(token).expect(200)).resolves.toMatchObject({
      body: { data: { selected: 'bank_transfer' } },
    });
    await put(token, 'digital_wallet').expect(200);
  });

  it('rechaza un método fuera del catálogo', async () => {
    const { token } = await signIn();
    const response = await put(token, 'fawry').expect(422);
    expect(response.body.error.code).toBe('PAYOUT_METHOD_NOT_AVAILABLE');
    expect((await put(token, '').expect(422)).body.error.code).toBe('PAYOUT_METHOD_NOT_AVAILABLE');
  });

  it('no permite cambiarlo en el mes de payout del usuario', async () => {
    const { token, userId } = await signIn();
    await put(token, 'prepaid_card').expect(200);

    // Un círculo que empezó este mes, con el usuario en el slot 1: cobra este mes.
    const thisMonth = Period.fromDate(new Date(), 'America/Lima').toString();
    const dataSource = app.get(DataSource);
    const circleId = randomUUID();
    await dataSource.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on)
       VALUES ($1, 600000, 'PEN', 6, $2)`,
      [circleId, `${thisMonth}-01`],
    );
    await dataSource.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 1, 'k')`,
      [randomUUID(), circleId, userId],
    );

    const response = await put(token, 'bank_transfer').expect(422);
    expect(response.body.error.code).toBe('PAYOUT_METHOD_CHANGE_NOT_ALLOWED');
    await put(token, 'prepaid_card').expect(200);
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer()).get('/v1/me/payout-method').expect(401);
  });
});
