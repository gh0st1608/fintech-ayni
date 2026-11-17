import './support/high-rate-limit';
import './support/dev-staff-auth';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp } from '@test/support/create-test-app';

/** Ofertas y metas de Home (COPAYNI-25): el back-office las carga y la app las muestra. */
describe('Contenido de Home', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  /** Sesión de la app: el contenido es el mismo para todos, pero el endpoint exige sesión. */
  async function member(): Promise<string> {
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    return (
      await http()
        .post('/v1/auth/verify')
        .send({ challengeId: started.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
  }

  async function staff(roles: StaffRole[]): Promise<string> {
    const response = await http()
      .post('/admin/v1/dev/sessions')
      .send({ email: `${randomUUID()}@ayni.local`, roles })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  const titlesOf = (items: unknown): string[] =>
    (items as { title: string }[]).map((item) => item.title);

  const goalBody = (overrides: Record<string, unknown> = {}) => ({
    texts: {
      es: { title: 'Fiestas Patrias', subtitle: 'Arma tu junta' },
      en: { title: 'Holidays' },
    },
    illustration: 'celebration',
    background: 'orange',
    target: 'join_circle',
    targetAmount: 300_000,
    position: 1,
    active: true,
    ...overrides,
  });

  const offerBody = (overrides: Record<string, unknown> = {}) => ({
    texts: { es: { title: 'Nuevas ofertas', subtitle: 'Mira lo nuevo' } },
    illustration: 'megaphone',
    background: 'cream',
    target: 'referral',
    position: 0,
    active: true,
    ...overrides,
  });

  afterEach(async () => {
    // Deja solo la meta sembrada por la migración.
    await database.query('DELETE FROM home_offers');
    await database.query("DELETE FROM home_goals WHERE target <> 'savings_plans'");
  });

  it('la app ve la meta sembrada, que apunta al ahorro', async () => {
    const token = await member();
    const content = (
      await http().get('/v1/home/content').set('Authorization', `Bearer ${token}`).expect(200)
    ).body.data;

    expect(content.offers).toEqual([]);
    expect(content.goals).toEqual([
      expect.objectContaining({
        title: 'Ahorro',
        subtitle: 'Gana cashback al ahorrar',
        illustration: 'piggy-bank',
        background: 'primary',
        target: 'savings_plans',
        targetAmount: null,
      }),
    ]);
  });

  it('lo que carga el back-office aparece en la app, en el idioma pedido', async () => {
    const editor = await staff(['operations']);
    await http()
      .post('/admin/v1/home-content/goals')
      .set('Authorization', `Bearer ${editor}`)
      .send(goalBody())
      .expect(200);
    await http()
      .post('/admin/v1/home-content/offers')
      .set('Authorization', `Bearer ${editor}`)
      .send(offerBody())
      .expect(200);

    const token = await member();
    const es = (
      await http().get('/v1/home/content').set('Authorization', `Bearer ${token}`).expect(200)
    ).body.data;
    expect(es.offers).toHaveLength(1);
    expect(titlesOf(es.goals)).toEqual(['Ahorro', 'Fiestas Patrias']);

    const en = (
      await http()
        .get('/v1/home/content?lang=en')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
    ).body.data;
    expect(titlesOf(en.goals)).toEqual(['Savings', 'Holidays']);
    // La oferta no tiene inglés: cae al español en vez de dejar un hueco.
    expect(en.offers[0].title).toBe('Nuevas ofertas');
  });

  it('lo apagado y lo vencido no llega a la app, pero el back-office lo sigue viendo', async () => {
    const editor = await staff(['operations']);
    await http()
      .post('/admin/v1/home-content/offers')
      .set('Authorization', `Bearer ${editor}`)
      .send(offerBody({ active: false }))
      .expect(200);
    await http()
      .post('/admin/v1/home-content/offers')
      .set('Authorization', `Bearer ${editor}`)
      .send(offerBody({ endsOn: '2026-01-01T00:00:00.000Z', position: 1 }))
      .expect(200);

    const token = await member();
    const content = (
      await http().get('/v1/home/content').set('Authorization', `Bearer ${token}`).expect(200)
    ).body.data;
    expect(content.offers).toEqual([]);

    const admin = (
      await http()
        .get('/admin/v1/home-content')
        .set('Authorization', `Bearer ${editor}`)
        .expect(200)
    ).body.data;
    expect(admin.offers).toHaveLength(2);
  });

  it('se edita y se borra, y queda auditado quién lo tocó', async () => {
    const editor = await staff(['operations']);
    const created = (
      await http()
        .post('/admin/v1/home-content/goals')
        .set('Authorization', `Bearer ${editor}`)
        .send(goalBody())
        .expect(200)
    ).body.data;
    expect(created.updatedBy).toMatch(/@ayni.local$/);

    const updated = (
      await http()
        .put(`/admin/v1/home-content/goals/${created.id as string}`)
        .set('Authorization', `Bearer ${editor}`)
        .send(goalBody({ texts: { es: { title: 'Campaña escolar' } }, active: false }))
        .expect(200)
    ).body.data;
    expect(updated.texts.es.title).toBe('Campaña escolar');
    expect(updated.active).toBe(false);

    await http()
      .delete(`/admin/v1/home-content/goals/${created.id as string}`)
      .set('Authorization', `Bearer ${editor}`)
      .expect(204);
    await http()
      .delete(`/admin/v1/home-content/goals/${created.id as string}`)
      .set('Authorization', `Bearer ${editor}`)
      .expect(404);

    const audit = await database.query<{ action: string }[]>(
      `SELECT action FROM staff_audit_log WHERE entity IN ('home_goal', 'home_offer')
        ORDER BY created_at`,
    );
    expect(audit.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'home_content.create_goal',
        'home_content.update_goal',
        'home_content.delete_goal',
      ]),
    );
  });

  it('rechaza contenido inválido y a quien no tiene permiso', async () => {
    const editor = await staff(['operations']);
    // Sin título en español.
    await http()
      .post('/admin/v1/home-content/goals')
      .set('Authorization', `Bearer ${editor}`)
      .send(goalBody({ texts: { en: { title: 'Only English' } } }))
      .expect(400);
    // Un destino que la app no sabe abrir.
    await http()
      .post('/admin/v1/home-content/goals')
      .set('Authorization', `Bearer ${editor}`)
      .send(goalBody({ target: 'https://promo.example.com' }))
      .expect(400);
    // Monto con un destino que no lo usa.
    await http()
      .post('/admin/v1/home-content/goals')
      .set('Authorization', `Bearer ${editor}`)
      .send(goalBody({ target: 'help', targetAmount: 1000 }))
      .expect(400);

    const finance = await staff(['finance']);
    await http()
      .post('/admin/v1/home-content/goals')
      .set('Authorization', `Bearer ${finance}`)
      .send(goalBody())
      .expect(403);
    await http().get('/admin/v1/home-content').expect(401);
    await http().get('/v1/home/content').expect(401);
  });
});
