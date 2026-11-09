import './support/high-rate-limit';
import './support/dev-staff-auth';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp, TestClock } from '@test/support/create-test-app';

const NOW = new Date('2026-11-09T15:00:00Z');

/** API del back-office con la identidad de desarrollo (docs/backoffice-plan.md, fases 1 y 2). */
describe('API del back-office', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const clock = new TestClock(NOW);

  beforeAll(async () => {
    app = await createTestApp({ clock });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  async function session(roles: StaffRole[], email = `${randomUUID()}@ayni.local`) {
    const response = await request(app.getHttpServer())
      .post('/admin/v1/dev/sessions')
      .send({ email, roles })
      .expect(201);
    return response.body.data.accessToken as string;
  }

  const get = (path: string, token: string) =>
    request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`);

  async function circleWithMember(state = 'collecting'): Promise<string> {
    const circleId = randomUUID();
    const userId = randomUUID();
    const phone = `+519${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`;
    await database.query(
      `INSERT INTO users (id, email, phone, status, first_name, last_name)
       VALUES ($1, $2, $3, 'active', 'Juana', 'Pérez')`,
      [userId, `juana.${userId}@mail.com`, phone],
    );
    await database.query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state)
       VALUES ($1, 600000, 'PEN', 6, '2026-12-01', $2)`,
      [circleId, state],
    );
    await database.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 2, $4)`,
      [randomUUID(), circleId, userId, randomUUID()],
    );
    return circleId;
  }

  it('la sesión de desarrollo identifica al personal y sus roles', async () => {
    const token = await session(['operations'], 'Ops@Ayni.Local');
    const me = await get('/admin/v1/me', token).expect(200);
    expect(me.body.data).toEqual({
      staffId: 'dev:ops@ayni.local',
      email: 'ops@ayni.local',
      roles: ['operations'],
      authenticatedAt: NOW.toISOString(),
    });
  });

  it('valida la sesión de desarrollo y rechaza tokens inválidos', async () => {
    await request(app.getHttpServer())
      .post('/admin/v1/dev/sessions')
      .send({ email: 'no-es-email', roles: ['root'] })
      .expect(400);
    await get('/admin/v1/me', 'token-falso').expect(401);
    await request(app.getHttpServer()).get('/admin/v1/me').expect(401);
  });

  it('lista por estado con paginación por cursor', async () => {
    const ids = [await circleWithMember('approving'), await circleWithMember('approving')];
    const token = await session(['support']);
    const first = await get('/admin/v1/circles?state=approving&limit=1', token).expect(200);
    expect(first.body.data.items).toHaveLength(1);
    expect(first.body.data.items[0]).toMatchObject({
      state: 'approving',
      payout: { amount: 600000, currency: 'PEN' },
      months: 6,
      startsOn: '2026-12',
      members: 1,
    });
    const cursor = first.body.data.nextCursor as string;
    expect(cursor).toEqual(expect.any(String));
    const second = await get(`/admin/v1/circles?state=approving&limit=1&cursor=${cursor}`, token);
    const seen = [first.body.data.items[0].circleId, second.body.data.items[0].circleId];
    expect(seen[0]).not.toBe(seen[1]);
    // Del más nuevo al más antiguo: las dos recién creadas son las primeras.
    expect(seen).toEqual([ids[1], ids[0]]);
  });

  it('rechaza filtros y cursores inválidos', async () => {
    const token = await session(['operations']);
    await get('/admin/v1/circles?state=open', token).expect(400);
    await get('/admin/v1/circles?limit=500', token).expect(400);
    const response = await get('/admin/v1/circles?cursor=basura', token).expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('el detalle muestra los miembros con sus datos personales enmascarados', async () => {
    const circleId = await circleWithMember();
    const token = await session(['finance']);
    const response = await get(`/admin/v1/circles/${circleId}`, token).expect(200);
    const [member] = response.body.data.memberships;
    expect(member).toMatchObject({ position: 2, name: 'Juana P.', expelledAt: null });
    expect(member.email).toMatch(/^j\*\*\*@mail\.com$/);
    expect(member.phone).toMatch(/^\+51\*+\d{3}$/);
    expect(JSON.stringify(response.body)).not.toContain('Pérez');
    expect(response.body.data.startProposal).toBeNull();
  });

  it('responde 404 y 400 para círculos inexistentes o ids inválidos', async () => {
    const token = await session(['operations']);
    const missing = await get(`/admin/v1/circles/${randomUUID()}`, token).expect(404);
    expect(missing.body.error.code).toBe('CIRCLE_NOT_FOUND');
    await get('/admin/v1/circles/123', token).expect(400);
  });

  it('un rol sin acceso a los círculos recibe 403', async () => {
    await get('/admin/v1/circles', await session(['admin'])).expect(403);
  });

  it('la pausa queda en la auditoría del personal, también cuando falla', async () => {
    const token = await session(['super_admin'], 'root@ayni.local');
    const missing = randomUUID();
    await request(app.getHttpServer())
      .post(`/admin/v1/circles/${missing}/pause`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Revisión de un reclamo' })
      .expect(404);
    const [row] = await database.query<
      { actor_id: string; action: string; outcome: string; details: Record<string, string> }[]
    >('SELECT actor_id, action, outcome, details FROM staff_audit_log WHERE entity_id = $1', [
      missing,
    ]);
    expect(row).toEqual({
      actor_id: 'dev:root@ayni.local',
      action: 'circle.pause',
      outcome: 'failed',
      details: { reason: 'Revisión de un reclamo', error: 'CIRCLE_NOT_FOUND' },
    });
  });

  it('la auditoría es de solo inserción', async () => {
    await expect(database.query('DELETE FROM staff_audit_log')).rejects.toThrow();
  });
});
