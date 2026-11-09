import './support/dev-staff-auth';
import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp } from '@test/support/create-test-app';

/** Búsqueda de personas para soporte (docs/backoffice-plan.md, fase 2). */
describe('API del back-office: personas', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  async function staff(roles: StaffRole[]): Promise<string> {
    const response = await http()
      .post('/admin/v1/dev/sessions')
      .send({ email: `${randomUUID()}@ayni.local`, roles })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  const get = (path: string, token: string) =>
    http().get(path).set('Authorization', `Bearer ${token}`);

  /** Una persona con nombre, un DNI aprobado y una junta. */
  async function person(): Promise<{
    userId: string;
    email: string;
    phone: string;
    circleId: string;
  }> {
    const userId = randomUUID();
    const circleId = randomUUID();
    const email = `rosa.${userId.slice(0, 8)}@mail.com`;
    const phone = `+519${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    await database.query(
      `INSERT INTO users (id, email, phone, status, first_name, last_name)
       VALUES ($1, $2, $3, 'active', 'Rosa', 'Quispe')`,
      [userId, email, phone],
    );
    await database.query(
      `INSERT INTO kyc_documents (id, user_id, type, kind, status, pages, upload_ids)
       VALUES (gen_random_uuid(), $1, 'national_id', 'national_id', 'approved', 2, '{}')`,
      [userId],
    );
    await database.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state)
       VALUES ($1, 600000, 'PEN', 6, '2026-12-01', 'collecting')`,
      [circleId],
    );
    await database.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 3, $4)`,
      [randomUUID(), circleId, userId, randomUUID()],
    );
    return { userId, email, phone, circleId };
  }

  it('encuentra por email, teléfono o id, siempre enmascarado', async () => {
    const rosa = await person();
    const token = await staff(['support']);

    for (const query of [rosa.email.toUpperCase(), rosa.phone, rosa.userId]) {
      const response = await get(
        `/admin/v1/users?query=${encodeURIComponent(query)}`,
        token,
      ).expect(200);
      expect(response.body.data.items).toEqual([
        expect.objectContaining({
          userId: rosa.userId,
          name: 'Rosa Q.',
          email: `r***@mail.com`,
          phone: `${rosa.phone.slice(0, 3)}******${rosa.phone.slice(-3)}`,
          status: 'active',
        }),
      ]);
      expect(JSON.stringify(response.body)).not.toContain(rosa.email);
    }
  });

  it('el perfil trae el estado del KYC y las juntas, y queda en la auditoría', async () => {
    const rosa = await person();
    const token = await staff(['operations']);

    const response = await get(`/admin/v1/users/${rosa.userId}`, token).expect(200);
    expect(response.body.data).toMatchObject({
      userId: rosa.userId,
      kyc: {
        national_id: 'approved',
        proof_of_income: 'not_submitted',
        additional: 'not_submitted',
      },
      circles: [
        {
          circleId: rosa.circleId,
          state: 'collecting',
          payout: { amount: 600000, currency: 'PEN' },
          position: 3,
          expelledAt: null,
        },
      ],
    });

    const [view] = await database.query<{ outcome: string }[]>(
      `SELECT outcome FROM staff_audit_log WHERE action = 'user.view' AND entity_id = $1`,
      [rosa.userId],
    );
    expect(view?.outcome).toBe('succeeded');
  });

  it('cada búsqueda queda auditada sin el dato buscado', async () => {
    const rosa = await person();
    const email = `${randomUUID()}@ayni.local`;
    const response = await http()
      .post('/admin/v1/dev/sessions')
      .send({ email, roles: ['support'] })
      .expect(201);
    const token = response.body.data.accessToken as string;

    await get(`/admin/v1/users?query=${encodeURIComponent(rosa.email)}`, token).expect(200);
    const rows = await database.query<{ details: unknown }[]>(
      `SELECT details FROM staff_audit_log WHERE action = 'user.search' AND actor_email = $1`,
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(rosa.email);
  });

  it('sin coincidencia exacta no devuelve nada; una búsqueda parcial se rechaza', async () => {
    const token = await staff(['finance']);
    const none = await get(`/admin/v1/users?query=${encodeURIComponent('nadie@mail.com')}`, token);
    expect(none.status).toBe(200);
    expect(none.body.data.items).toEqual([]);

    const partial = await get('/admin/v1/users?query=rosa', token).expect(400);
    expect(partial.body.error.details).toEqual({ query: 'invalid' });
    await get('/admin/v1/users', token).expect(400);
  });

  it('valida el id, responde 404 si no existe y exige un rol del personal', async () => {
    const token = await staff(['super_admin']);
    await get('/admin/v1/users/no-es-uuid', token).expect(400);
    const missing = await get(`/admin/v1/users/${randomUUID()}`, token).expect(404);
    expect(missing.body.error.code).toBe('USER_NOT_FOUND');
    await get('/admin/v1/users?query=a@b.pe', await staff(['admin'])).expect(403);
    await http().get('/admin/v1/users?query=a@b.pe').expect(401);
  });
});
