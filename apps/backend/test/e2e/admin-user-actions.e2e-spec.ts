import './support/dev-staff-auth';
import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { type StaffRole } from '@src/shared/application/ports/staff-authenticator.port';
import { createTestApp } from '@test/support/create-test-app';

/** Acciones de soporte del back-office sobre una persona (docs/backoffice-plan.md, fase 2). */
describe('API del back-office: acciones de soporte', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  async function staff(roles: StaffRole[], email = `${randomUUID()}@ayni.local`): Promise<string> {
    const response = await http().post('/admin/v1/dev/sessions').send({ email, roles }).expect(201);
    return response.body.data.accessToken as string;
  }

  const as = (token: string) => ({
    get: (path: string) => http().get(path).set('Authorization', `Bearer ${token}`),
    post: (path: string, body: object = {}) =>
      http().post(path).set('Authorization', `Bearer ${token}`).send(body),
  });

  /** Una persona que inicia sesión desde la app: devuelve su id, su email y su refresh token. */
  async function signedInPerson(): Promise<{ userId: string; email: string; refresh: string }> {
    const email = `soporte.${randomUUID().slice(0, 8)}@mail.com`;
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: email, type: 'email' })
      .expect(200);
    const tokens = await http()
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' })
      .expect(200);
    const [row] = await database.query<{ id: string }[]>('SELECT id FROM users WHERE email = $1', [
      email,
    ]);
    return { userId: row!.id, email, refresh: tokens.body.data.refreshToken as string };
  }

  async function login(email: string) {
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: email, type: 'email' })
      .expect(200);
    return http()
      .post('/v1/auth/verify')
      .send({ challengeId: started.body.data.challengeId, code: '1234' });
  }

  it('revocar cierra las sesiones: el refresh token deja de servir', async () => {
    const person = await signedInPerson();
    const support = as(await staff(['support']));

    await support.post(`/admin/v1/users/${person.userId}/sessions/revoke`).expect(400);
    const revoked = await support
      .post(`/admin/v1/users/${person.userId}/sessions/revoke`, { reason: 'Robo del teléfono' })
      .expect(200);
    expect(revoked.body.data).toEqual({ revokedSessions: 1 });
    await http().post('/v1/auth/refresh').send({ refreshToken: person.refresh }).expect(401);
    // Puede volver a entrar: revocar no bloquea.
    await login(person.email).then((response) => expect(response.status).toBe(200));
  });

  it('bloquear impide abrir sesión; desbloquear (con autenticación reciente) la devuelve', async () => {
    const person = await signedInPerson();
    const operations = as(await staff(['operations']));

    const blocked = await operations
      .post(`/admin/v1/users/${person.userId}/block`, { reason: 'Fraude reportado' })
      .expect(200);
    expect(blocked.body.data).toEqual({ blocked: true, changed: true, revokedSessions: 1 });
    const again = await operations
      .post(`/admin/v1/users/${person.userId}/block`, { reason: 'Otra vez' })
      .expect(200);
    expect(again.body.data.changed).toBe(false);

    const refresh = await http().post('/v1/auth/refresh').send({ refreshToken: person.refresh });
    expect(refresh.status).toBe(401);
    const denied = await login(person.email);
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('USER_BLOCKED');

    const detail = await operations.get(`/admin/v1/users/${person.userId}`).expect(200);
    expect(detail.body.data.blocked).toMatchObject({ reason: 'Fraude reportado' });

    const unblocked = await operations
      .post(`/admin/v1/users/${person.userId}/unblock`, { reason: 'Caso resuelto' })
      .expect(200);
    expect(unblocked.body.data).toMatchObject({ blocked: false, changed: true });
    expect((await login(person.email)).status).toBe(200);

    const actions = await database.query<{ action: string; details: { reason?: string } }[]>(
      `SELECT action, details FROM staff_audit_log
        WHERE entity_id = $1 AND action IN ('user.block', 'user.unblock') ORDER BY created_at`,
      [person.userId],
    );
    expect(actions.map((row) => [row.action, row.details.reason])).toEqual([
      ['user.block', 'Fraude reportado'],
      ['user.block', 'Otra vez'],
      ['user.unblock', 'Caso resuelto'],
    ]);
  });

  it('revelar el dato completo exige el rol, motivo y queda auditado', async () => {
    const person = await signedInPerson();
    await as(await staff(['support']))
      .post(`/admin/v1/users/${person.userId}/pii/reveal`, { reason: 'Verificar identidad' })
      .expect(403);

    const operations = as(await staff(['operations']));
    await operations
      .post(`/admin/v1/users/${person.userId}/pii/reveal`, { reason: '  ' })
      .expect(400);
    const revealed = await operations
      .post(`/admin/v1/users/${person.userId}/pii/reveal`, { reason: 'Verificar identidad' })
      .expect(200);
    expect(revealed.body.data).toMatchObject({ email: person.email, phone: null });

    const [audit] = await database.query<{ outcome: string }[]>(
      `SELECT outcome FROM staff_audit_log
        WHERE action = 'user.pii.reveal' AND entity_id = $1 AND outcome = 'succeeded'`,
      [person.userId],
    );
    expect(audit).toBeDefined();
  });

  it('las notas de soporte se agregan con su autor y se listan de la más reciente a la más antigua', async () => {
    const person = await signedInPerson();
    const author = `${randomUUID()}@ayni.local`;
    const support = as(await staff(['support'], author));

    await support.post(`/admin/v1/users/${person.userId}/notes`, { body: '   ' }).expect(400);
    await support
      .post(`/admin/v1/users/${person.userId}/notes`, { body: 'Llamó por un cobro duplicado' })
      .expect(201);
    await support
      .post(`/admin/v1/users/${person.userId}/notes`, { body: 'Se derivó a finanzas' })
      .expect(201);

    const notes = await as(await staff(['finance']))
      .get(`/admin/v1/users/${person.userId}/notes`)
      .expect(200);
    const items = notes.body.data.items as { body: string; authorEmail: string }[];
    expect(items.map((note) => note.body)).toEqual([
      'Se derivó a finanzas',
      'Llamó por un cobro duplicado',
    ]);
    expect(notes.body.data.items[0]).toMatchObject({ authorEmail: author });

    // Finanzas lee pero no escribe; las notas no se pueden borrar ni editar.
    await as(await staff(['finance']))
      .post(`/admin/v1/users/${person.userId}/notes`, { body: 'x' })
      .expect(403);
    await expect(
      database.query('UPDATE support_notes SET body = $1 WHERE user_id = $2', ['x', person.userId]),
    ).rejects.toThrow();
  });

  it('una persona inexistente responde 404 en cada acción', async () => {
    const operations = as(await staff(['super_admin']));
    const missing = randomUUID();
    for (const path of ['sessions/revoke', 'block', 'unblock', 'pii/reveal']) {
      const response = await operations
        .post(`/admin/v1/users/${missing}/${path}`, { reason: 'Prueba' })
        .expect(404);
      expect(response.body.error.code).toBe('USER_NOT_FOUND');
    }
    await operations.post(`/admin/v1/users/${missing}/notes`, { body: 'Nota' }).expect(404);
    await operations.post('/admin/v1/users/no-es-uuid/block', { reason: 'x' }).expect(400);
  });

  it('el admin del personal y finanzas no bloquean', async () => {
    const person = await signedInPerson();
    for (const role of ['admin', 'finance'] as const) {
      await as(await staff([role]))
        .post(`/admin/v1/users/${person.userId}/block`, { reason: 'x' })
        .expect(403);
    }
  });
});
