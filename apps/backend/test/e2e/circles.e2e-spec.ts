import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp, VALID_TOKEN } from '@test/support/create-test-app';

describe('GET /v1/circles/join-config', () => {
  let app: NestExpressApplication;

  afterEach(async () => {
    await app.close();
  });

  it('devuelve los montos de unión según docs/api/circles.md', async () => {
    app = await createTestApp();

    const response = await request(app.getHttpServer())
      .get('/v1/circles/join-config')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(200);

    expect(response.body).toEqual({
      success: true,
      data: {
        payout: {
          min: { amount: 300000, currency: 'PEN' },
          max: { amount: 12000000, currency: 'PEN' },
          step: { amount: 50000, currency: 'PEN' },
        },
        userPayoutLimit: null,
        savingProgramMax: { amount: 100000000, currency: 'PEN' },
      },
      traceId: response.headers['x-trace-id'],
    });
  });

  it.each([
    ['sin cabecera', undefined],
    ['con un token inválido', 'Bearer otro-token'],
  ])('responde 401 %s', async (_case, authorization) => {
    app = await createTestApp();
    const call = request(app.getHttpServer()).get('/v1/circles/join-config');
    if (authorization) void call.set('Authorization', authorization);

    const response = await call.expect(401);
    expect(response.body).toMatchObject({ success: false, error: { code: 'UNAUTHORIZED' } });
  });

  it('con el verificador de producción, ningún token es válido hasta que exista auth', async () => {
    app = await createTestApp({ verifier: null });

    await request(app.getHttpServer())
      .get('/v1/circles/join-config')
      .set('Authorization', `Bearer ${VALID_TOKEN}`)
      .expect(401);
  });
});

describe('GET /v1/circles/installment-options', () => {
  let app: NestExpressApplication;

  // Una app por prueba: el rate limit de las pruebas es de 5 peticiones.
  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(() => app.close());

  const get = (query: string) =>
    request(app.getHttpServer())
      .get(`/v1/circles/installment-options${query}`)
      .set('Authorization', `Bearer ${VALID_TOKEN}`);

  it('devuelve las cuotas por duración para el payout elegido', async () => {
    const response = await get('?payoutAmount=3000000').expect(200);

    expect(response.body.data).toEqual({
      payout: { amount: 3000000, currency: 'PEN' },
      options: [
        { months: 6, installment: { amount: 500000, currency: 'PEN' } },
        { months: 10, installment: { amount: 300000, currency: 'PEN' } },
        { months: 12, installment: { amount: 250000, currency: 'PEN' } },
      ],
    });
  });

  it('omite las duraciones que no dan cuotas exactas', async () => {
    // 3.500,00 entre 6 o 12 no da céntimos exactos; entre 10 sí.
    const response = await get('?payoutAmount=350000').expect(200);
    const { options } = response.body.data as { options: { months: number }[] };
    expect(options.map(({ months }) => months)).toEqual([10]);
  });

  it.each([
    ['bajo el mínimo', '250000'],
    ['sobre el máximo', '12050000'],
    ['fuera del salto del slider', '310000'],
  ])('responde 422 PAYOUT_NOT_ALLOWED con un payout %s', async (_case, amount) => {
    const response = await get(`?payoutAmount=${amount}`).expect(422);
    expect(response.body.error.code).toBe('PAYOUT_NOT_ALLOWED');
  });

  it.each([
    ['sin payoutAmount', ''],
    ['con un payoutAmount no entero', '?payoutAmount=3000000.5'],
    ['con texto', '?payoutAmount=mucho'],
    ['con parámetros no declarados', '?payoutAmount=3000000&extra=1'],
  ])('responde 400 VALIDATION_ERROR %s', async (_case, query) => {
    const response = await get(query).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('exige autenticación', async () => {
    await request(app.getHttpServer())
      .get('/v1/circles/installment-options?payoutAmount=3000000')
      .expect(401);
  });
});
