import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { createTestApp, TestClock } from '@test/support/create-test-app';

/**
 * Firma del contrato y del pagaré por HTTP (COPAYNI-89, docs/api/agreements.md). El OTP de las
 * pruebas es el código fijo de desarrollo, así que el de firma también es `1234`.
 */
describe('/v1/me/agreements', () => {
  let app: NestExpressApplication;
  const clock = new TestClock(new Date('2026-11-16T15:00:00Z'));

  beforeAll(async () => {
    app = await createTestApp({ verifier: null, clock });
  });

  afterAll(() => app.close());

  /** Entra con un teléfono, para que el código de firma tenga a dónde ir. */
  async function signIn(): Promise<string> {
    const phone = `+519${String(Date.now()).slice(-8)}`;
    const started = await request(app.getHttpServer())
      .post('/v1/auth/start')
      .send({ identifier: phone, type: 'phone' })
      .expect(200);
    const verified = await request(app.getHttpServer())
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    const token = verified.body.data.accessToken as string;
    await request(app.getHttpServer())
      .put('/v1/me/payout-method')
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'bank_account' })
      .expect(200);
    return token;
  }

  /** Versión por defecto de CIRCLE_TERMS_VERSION. */
  const TERMS_VERSION = '2026-11';

  /** Se une a un círculo nuevo: al unirse quedan los dos documentos pendientes de firma. */
  async function join(token: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/v1/circles/join')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', randomUUID())
      .send({
        circleId: null,
        payoutAmount: 600_000,
        months: 10,
        position: 4,
        termsVersion: TERMS_VERSION,
      })
      .expect(201);
    const agreements = await request(app.getHttpServer())
      .get('/v1/me/agreements')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return agreements.body.data.agreements[0].id as string;
  }

  it('al unirse quedan los dos documentos pendientes, con su plazo', async () => {
    const token = await signIn();
    const id = await join(token);

    const { body } = await request(app.getHttpServer())
      .get('/v1/me/agreements')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(body.data.agreements[0]).toMatchObject({
      id,
      position: 4,
      status: 'pending',
      signedAt: null,
      unread: ['contract', 'promissory_note'],
    });
    // 48 h desde la unión.
    expect(body.data.agreements[0].expiresAt).toBe('2026-11-18T15:00:00.000Z');
  });

  it('sin leer los dos documentos, pedir el código responde 422', async () => {
    const token = await signIn();
    const id = await join(token);

    await request(app.getHttpServer())
      .post(`/v1/me/agreements/${id}/signature-code`)
      .set('Authorization', `Bearer ${token}`)
      .expect(422)
      .expect(({ body }) => {
        expect(body.error.code).toBe('AGREEMENT_DOCUMENTS_NOT_READ');
      });
  });

  it('leídos los dos, el código firma ambos y el checklist los cumple', async () => {
    const token = await signIn();
    const id = await join(token);

    for (const document of ['contract', 'promissory_note']) {
      const read = await request(app.getHttpServer())
        .get(`/v1/me/agreements/${id}/documents/${document}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(read.body.data.text).toContain('TEXTO PROVISIONAL');
      expect(read.body.data.hash).toHaveLength(64);
    }

    // Antes de firmar, el checklist marca pendientes el contrato y el pagaré.
    const before = await request(app.getHttpServer())
      .get('/v1/me/payout-eligibility')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body.data.requirements).toEqual(
      expect.arrayContaining([
        { requirement: 'contract', status: 'pending' },
        { requirement: 'insurance_note', status: 'pending' },
      ]),
    );

    await request(app.getHttpServer())
      .post(`/v1/me/agreements/${id}/signature-code`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201)
      .expect(({ body }) => {
        expect(body.data.maskedDestination).toMatch(/•/);
      });

    // Un código incorrecto no firma y avisa cuántos intentos quedan.
    await request(app.getHttpServer())
      .post(`/v1/me/agreements/${id}/signature`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '9999' })
      .expect(422)
      .expect(({ body }) => {
        expect(body.error.code).toBe('SIGNATURE_CODE_INVALID');
      });

    await request(app.getHttpServer())
      .post(`/v1/me/agreements/${id}/signature`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '1234' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.data).toMatchObject({ id, status: 'signed' });
        expect(body.data.signedAt).not.toBeNull();
      });

    // Firmado, el checklist los cumple y no se vuelve a firmar.
    const after = await request(app.getHttpServer())
      .get('/v1/me/payout-eligibility')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.data.requirements).toEqual(
      expect.arrayContaining([
        { requirement: 'contract', status: 'met' },
        { requirement: 'insurance_note', status: 'met' },
      ]),
    );
    await request(app.getHttpServer())
      .post(`/v1/me/agreements/${id}/signature-code`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe('AGREEMENT_NOT_PENDING');
      });
  });

  it('el acuerdo de otra persona no existe', async () => {
    const owner = await signIn();
    const id = await join(owner);
    const stranger = await signIn();

    await request(app.getHttpServer())
      .get(`/v1/me/agreements/${id}/documents/contract`)
      .set('Authorization', `Bearer ${stranger}`)
      .expect(404)
      .expect(({ body }) => {
        expect(body.error.code).toBe('AGREEMENT_NOT_FOUND');
      });
  });
});
