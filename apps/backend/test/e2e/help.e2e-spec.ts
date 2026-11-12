import './support/dev-staff-auth';
import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp } from '@test/support/create-test-app';

/** Ayuda y política de pagos (COPAYNI-83). */
describe('Ayuda', () => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
  });

  afterAll(() => app.close());

  async function staff(roles: StaffRole[]): Promise<string> {
    const response = await http()
      .post('/admin/v1/dev/sessions')
      .send({ email: `${randomUUID()}@ayni.local`, roles })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  const put = (token: string, lang: string, body: object) =>
    http().put(`/admin/v1/help/${lang}`).set('Authorization', `Bearer ${token}`).send(body);

  it('la ayuda es pública y trae las preguntas iniciales en español', async () => {
    const help = (await http().get('/v1/help?lang=es').expect(200)).body.data;
    expect(help.language).toBe('es');
    expect(help.faqs.length).toBeGreaterThan(0);
    expect(help.faqs[0]).toEqual({
      id: expect.any(String),
      question: expect.any(String),
      answer: expect.any(String),
    });
    // Sin SUPPORT_WHATSAPP_NUMBER no se ofrece el canal.
    expect(help.support).toBeNull();
    // Un idioma desconocido usa el de por defecto.
    expect((await http().get('/v1/help?lang=fr').expect(200)).body.data.language).toBe('es');
  });

  it('el personal edita el contenido y se publica al instante; sin contenido cae a es', async () => {
    const operations = await staff(['operations']);
    const original = (
      await http().get('/admin/v1/help/en').set('Authorization', `Bearer ${operations}`).expect(200)
    ).body.data;

    try {
      const saved = await put(operations, 'en', {
        faqs: [{ question: '  How do I pay?  ', answer: 'From the Payment tab.' }],
        paymentPolicy: 'Installments are due on day 1.',
      }).expect(200);
      expect(saved.body.data).toMatchObject({
        language: 'en',
        faqs: [{ question: 'How do I pay?', answer: 'From the Payment tab.' }],
        paymentPolicy: 'Installments are due on day 1.',
        updatedAt: expect.any(String),
      });
      const english = (await http().get('/v1/help?lang=en').expect(200)).body.data;
      expect(english).toMatchObject({
        language: 'en',
        faqs: [{ question: 'How do I pay?' }],
        paymentPolicy: { body: 'Installments are due on day 1.' },
      });

      await put(operations, 'en', { faqs: [], paymentPolicy: null }).expect(200);
      expect((await http().get('/v1/help?lang=en').expect(200)).body.data.language).toBe('es');

      const invalid = await put(operations, 'en', {
        faqs: [{ question: 'Sin respuesta', answer: '   ' }],
        paymentPolicy: null,
      }).expect(400);
      expect(invalid.body.error.details).toEqual({ faqs: 'incomplete' });
      await put(operations, 'fr', { faqs: [], paymentPolicy: null }).expect(400);
    } finally {
      await put(operations, 'en', {
        faqs: (original.faqs as { question: string; answer: string }[]).map(
          ({ question, answer }) => ({ question, answer }),
        ),
        paymentPolicy: original.paymentPolicy as string | null,
      }).expect(200);
    }
  });

  it('solo Operaciones y el admin general editan; Finanzas no ve el editor', async () => {
    const support = await staff(['support']);
    await http().get('/admin/v1/help/es').set('Authorization', `Bearer ${support}`).expect(200);
    await put(support, 'es', { faqs: [], paymentPolicy: null }).expect(403);
    const finance = await staff(['finance']);
    await http().get('/admin/v1/help/es').set('Authorization', `Bearer ${finance}`).expect(403);
  });
});
