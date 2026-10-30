import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp } from '@test/support/create-test-app';

/** Documentos KYC (COPAYNI-43, 46 a 49) con el almacenamiento y el proveedor simulados. */
describe('Documentos y KYC', () => {
  let app: NestExpressApplication;
  let token: string;

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    token = (
      await request(app.getHttpServer())
        .post('/v1/auth/verify')
        .send({ challengeId: started.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
  });

  afterAll(() => app.close());

  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(`/v1/me/documents${path}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const upload = async (purpose: string): Promise<string> =>
    (await post('/uploads', { purpose, contentType: 'image/jpeg', sizeBytes: 524288 }).expect(201))
      .body.data.uploadId as string;

  it('sin documentos, todo está pendiente de enviar', async () => {
    const response = await request(app.getHttpServer())
      .get('/v1/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body.data).toEqual({
      summary: {
        national_id: 'not_submitted',
        proof_of_income: 'not_submitted',
        additional: 'not_submitted',
      },
      items: [],
    });
  });

  it('pide una URL de subida y valida el archivo', async () => {
    const response = await post('/uploads', {
      purpose: 'national_id_front',
      contentType: 'image/png',
      sizeBytes: 1000,
    }).expect(201);
    expect(response.body.data).toEqual({
      uploadId: expect.any(String),
      uploadUrl: expect.stringContaining('https://'),
      expiresAt: expect.any(String),
    });
    for (const body of [
      { purpose: 'selfie', contentType: 'image/png', sizeBytes: 1000 },
      { purpose: 'additional', contentType: 'text/html', sizeBytes: 1000 },
      { purpose: 'additional', contentType: 'image/png', sizeBytes: 50 * 1024 * 1024 },
    ]) {
      const invalid = await post('/uploads', body).expect(400);
      expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  it('verifica el National ID, el ingreso fija el límite y una subida no se reutiliza', async () => {
    const front = await upload('national_id_front');
    const nationalId = await post('/national-id', {
      frontUploadId: front,
      backUploadId: await upload('national_id_back'),
    }).expect(200);
    expect(nationalId.body.data).toMatchObject({
      type: 'national_id',
      status: 'approved',
      pages: 2,
    });

    const reused = await post('/national-id', {
      frontUploadId: front,
      backUploadId: await upload('national_id_back'),
    }).expect(422);
    expect(reused.body.error.code).toBe('UPLOAD_NOT_USABLE');

    const income = await post('/proof-of-income', {
      kind: 'hr_letter',
      monthlyIncome: 350000,
      uploadIds: [await upload('proof_of_income')],
    }).expect(200);
    expect(income.body.data).toMatchObject({
      status: 'approved',
      monthlyIncome: { amount: 350000, currency: 'PEN' },
    });
    const me = await request(app.getHttpServer())
      .get('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // R5 provisional: el 30 % del ingreso aprobado.
    expect(me.body.data.monthlyPayInLimit).toEqual({ amount: 105000, currency: 'PEN' });

    await post('/additional', {
      kind: 'utility_bill',
      uploadIds: [await upload('additional')],
    }).expect(200);
    const list = await request(app.getHttpServer())
      .get('/v1/me/documents')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(list.body.data.summary).toEqual({
      national_id: 'approved',
      proof_of_income: 'approved',
      additional: 'in_review',
    });
    expect(list.body.data.items).toHaveLength(3);
  });

  it('valida los cuerpos y exige sesión', async () => {
    await post('/national-id', { frontUploadId: 'x', backUploadId: randomUUID() }).expect(400);
    await post('/proof-of-income', {
      kind: 'hr_letter',
      monthlyIncome: 0,
      uploadIds: [randomUUID()],
    }).expect(400);
    await post('/additional', { kind: 'other', uploadIds: [] }).expect(400);
    const unknown = await post('/national-id', {
      frontUploadId: randomUUID(),
      backUploadId: randomUUID(),
    }).expect(422);
    expect(unknown.body.error.code).toBe('UPLOAD_NOT_USABLE');
    await request(app.getHttpServer()).get('/v1/me/documents').expect(401);
  });
});
