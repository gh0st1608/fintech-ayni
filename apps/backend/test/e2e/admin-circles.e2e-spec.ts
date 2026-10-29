import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import {
  type StaffAuthenticatorPort,
  type StaffPrincipal,
} from '@src/shared/application/ports/staff-authenticator.port';
import { UnauthorizedError } from '@src/shared/errors/app-error';
import { createTestApp, TestClock, VALID_TOKEN } from '@test/support/create-test-app';

const NOW = new Date('2026-11-03T15:00:00Z');
/** Tokens de prueba del personal: cada uno es una persona con un rol y una antigüedad. */
const STAFF: Record<string, StaffPrincipal> = {
  'super-reciente': { staffId: 'staff-1', roles: ['super_admin'], authenticatedAt: NOW },
  'super-viejo': {
    staffId: 'staff-1',
    roles: ['super_admin'],
    authenticatedAt: new Date(NOW.getTime() - 3_600_000),
  },
  operaciones: { staffId: 'staff-2', roles: ['operations', 'admin'], authenticatedAt: NOW },
};
const fakeStaff: StaffAuthenticatorPort = {
  authenticate: (token) => {
    const staff = STAFF[token];
    return staff ? Promise.resolve(staff) : Promise.reject(new UnauthorizedError());
  },
};

/** `POST /admin/v1/circles/:circleId/pause|resume` (COPAYNI-61). */
describe('API de administración: pausa de círculos', () => {
  let app: NestExpressApplication;
  let unconfigured: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ staff: fakeStaff, clock: new TestClock(NOW) });
    unconfigured = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await unconfigured.close();
  });

  /** Un círculo en curso desde noviembre de 2026, sin miembros. */
  async function runningCircle(): Promise<string> {
    const id = randomUUID();
    await app.get(DataSource).query(
      `INSERT INTO circles (id, payout_amount, currency, months, starts_on, cycle_state, current_period)
       VALUES ($1, 600000, 'PEN', 6, '2026-11-01', 'contributing', '2026-11-01')`,
      [id],
    );
    return id;
  }

  const post = (target: NestExpressApplication, path: string, token?: string, body = {}) => {
    const call = request(target.getHttpServer()).post(path);
    return (token ? call.set('Authorization', `Bearer ${token}`) : call).send(body);
  };

  it('el super_admin pausa y reanuda, de forma idempotente', async () => {
    const id = await runningCircle();
    const reason = { reason: 'Reclamo de un miembro' };
    const paused = await post(app, `/admin/v1/circles/${id}/pause`, 'super-reciente', reason);
    expect(paused.status).toBe(200);
    expect(paused.body.data).toEqual({
      circleId: id,
      state: 'paused',
      changed: true,
      startsOn: '2026-11',
      endsOn: '2027-04',
    });
    const again = await post(app, `/admin/v1/circles/${id}/pause`, 'super-reciente', reason);
    expect(again.body.data).toMatchObject({ changed: false });

    const resumed = await post(app, `/admin/v1/circles/${id}/resume`, 'super-reciente', {
      reason: 'Resuelto',
    });
    expect(resumed.body.data).toMatchObject({ state: 'contributing', changed: true });
    const rows = await app
      .get(DataSource)
      .query<{ total: number }[]>(
        'SELECT count(*)::int AS total FROM circle_admin_events WHERE circle_id = $1',
        [id],
      );
    expect(rows[0]?.total).toBe(2);
  });

  it.each([
    ['sin token', undefined, 401, 'UNAUTHORIZED'],
    ['con el token de la app', VALID_TOKEN, 401, 'UNAUTHORIZED'],
    ['sin autenticación reciente', 'super-viejo', 401, 'UNAUTHORIZED'],
    ['sin el rol super_admin', 'operaciones', 403, 'FORBIDDEN'],
  ])('rechaza %s', async (_name, token, status, code) => {
    const id = await runningCircle();
    const response = await post(app, `/admin/v1/circles/${id}/pause`, token, { reason: 'x' });
    expect(response.status).toBe(status);
    expect(response.body.error.code).toBe(code);
  });

  it('valida el motivo, el id y que el círculo exista y esté pausado', async () => {
    const id = await runningCircle();
    const cases: [string, object, number, string][] = [
      [`/admin/v1/circles/${id}/pause`, {}, 400, 'VALIDATION_ERROR'],
      ['/admin/v1/circles/no-es-uuid/pause', { reason: 'x' }, 400, 'VALIDATION_ERROR'],
      [`/admin/v1/circles/${randomUUID()}/pause`, { reason: 'x' }, 404, 'CIRCLE_NOT_FOUND'],
    ];
    for (const [path, body, status, code] of cases) {
      const response = await post(app, path, 'super-reciente', body);
      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(code);
    }
    // Reanudar uno en curso no hace nada.
    const resumed = await post(app, `/admin/v1/circles/${id}/resume`, 'super-reciente', {
      reason: 'x',
    });
    expect(resumed.body.data).toMatchObject({ changed: false });
  });

  it('sin la autenticación del personal configurada, la API rechaza todo', async () => {
    const response = await post(
      unconfigured,
      `/admin/v1/circles/${randomUUID()}/pause`,
      'super-reciente',
      { reason: 'x' },
    );
    expect(response.status).toBe(401);
  });
});
