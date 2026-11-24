import './support/high-rate-limit';

import { randomUUID } from 'node:crypto';

import { type NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { DataSource } from 'typeorm';

import { SyncNotificationsUseCase } from '@src/modules/notifications/application/notifications.use-cases';
import { SendPendingPushUseCase } from '@src/modules/notifications/application/push.use-cases';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { createTestApp } from '@test/support/create-test-app';

/** Hoy en la zona del negocio, y un día relativo a hoy (`YYYY-MM-DD`). */
const TODAY = LocalDate.fromDate(new Date(), 'America/Lima').toString();
function day(offset: number): string {
  const date = new Date(`${TODAY}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
const monthStart = (date: string, offset = 0): string => {
  const value = new Date(`${date.slice(0, 7)}-01T12:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 10);
};

/** Bandeja de notificaciones (COPAYNI-84). */
describe('Notificaciones', () => {
  let app: NestExpressApplication;
  let database: DataSource;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp({ verifier: null });
    database = app.get(DataSource);
  });

  afterAll(() => app.close());

  async function member(): Promise<{ userId: string; token: string }> {
    const started = await http()
      .post('/v1/auth/start')
      .send({ identifier: `${randomUUID()}@mail.com`, type: 'email' })
      .expect(200);
    const token = (
      await http()
        .post('/v1/auth/verify')
        .send({ challengeId: started.body.data.challengeId, code: '1234' })
        .expect(200)
    ).body.data.accessToken as string;
    const me = await http()
      .patch('/v1/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ firstName: 'Juana', lastName: 'Torres' })
      .expect(200);
    return { userId: me.body.data.id as string, token };
  }

  /** Una junta en curso que empezó este mes, con la persona en el turno 1 y varias cuotas. */
  async function circleWithInstallments(userId: string): Promise<string> {
    const circleId = randomUUID();
    await database.query(
      `INSERT INTO circles (id, payout_amount, currency, turns, starts_on, cycle_state)
       VALUES ($1, 600000, 'PEN', 6, $2, 'contributing')`,
      [circleId, monthStart(TODAY)],
    );
    await database.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 1, $4)`,
      [randomUUID(), circleId, userId, randomUUID()],
    );
    // El turno va con el mes: la junta empezó este mes, así que el desplazamiento lo ordena.
    const installment = (offset: number, dueOn: string, status: string, paidAt: Date | null) =>
      database.query(
        `INSERT INTO circle_installments
           (id, circle_id, user_id, position, turn, period, due_on, amount, currency, status,
            paid_at)
         VALUES ($1, $2, $3, 1, $4, $5, $6, 100000, 'PEN', $7, $8)`,
        [
          randomUUID(),
          circleId,
          userId,
          offset + 3,
          monthStart(TODAY, offset),
          dueOn,
          status,
          paidAt,
        ],
      );
    await installment(1, day(2), 'pending', null); // vence en 2 días
    await installment(2, TODAY, 'pending', null); // vence hoy
    await installment(3, day(20), 'pending', null); // todavía no se avisa
    await installment(-1, day(-30), 'paid', new Date(Date.now() - 3_600_000));
    await installment(-2, day(-60), 'overdue', null);
    return circleId;
  }

  const inbox = (token: string, query = '') =>
    http().get(`/v1/me/notifications${query}`).set('Authorization', `Bearer ${token}`);

  it('arma la bandeja con los hechos de la persona, una sola vez cada uno', async () => {
    const juana = await member();
    const circleId = await circleWithInstallments(juana.userId);
    await database.query(
      `INSERT INTO kyc_documents (id, user_id, type, kind, status, pages, upload_ids, reviewed_at)
       VALUES (gen_random_uuid(), $1, 'national_id', 'national_id', 'approved', 2, '{}', now())`,
      [juana.userId],
    );

    const first = (await inbox(juana.token).expect(200)).body.data;
    const types = (first.items as { type: string }[]).map((item) => item.type).sort();
    expect(types).toEqual(
      [
        'circle_started',
        'document_approved',
        'installment_due_soon',
        'installment_due_today',
        'payment_failed',
        'payment_received',
        'payout_turn',
      ].sort(),
    );
    expect(first.unread).toBe(7);
    const items = first.items as { type: string }[];
    expect(items.find((item) => item.type === 'installment_due_soon')).toMatchObject({
      category: 'payments',
      read: false,
      data: { circleId, amount: { amount: 100000, currency: 'PEN' }, dueOn: day(2) },
    });

    // La tarea diaria y una nueva lectura no duplican nada.
    await app.get(SyncNotificationsUseCase).execute();
    const again = (await inbox(juana.token).expect(200)).body.data;
    expect(again.items).toHaveLength(7);

    const payments = (await inbox(juana.token, '?category=payments').expect(200)).body.data;
    expect(
      (payments.items as { category: string }[]).every((item) => item.category === 'payments'),
    ).toBe(true);
    expect(payments.items).toHaveLength(5);
    const circles = (await inbox(juana.token, '?category=circles').expect(200)).body.data;
    expect(circles.items).toEqual([expect.objectContaining({ type: 'circle_started' })]);
  });

  it('marcar como leída baja el contador; sin ids marca todas', async () => {
    const juana = await member();
    await circleWithInstallments(juana.userId);
    const { items } = (await inbox(juana.token).expect(200)).body.data;

    const marked = await http()
      .post('/v1/me/notifications/read')
      .set('Authorization', `Bearer ${juana.token}`)
      .send({ ids: [items[0].id] })
      .expect(200);
    expect(marked.body.data).toEqual({ unread: items.length - 1 });

    const count = await http()
      .get('/v1/me/notifications/unread-count')
      .set('Authorization', `Bearer ${juana.token}`)
      .expect(200);
    expect(count.body.data).toEqual({ unread: items.length - 1 });

    const all = await http()
      .post('/v1/me/notifications/read')
      .set('Authorization', `Bearer ${juana.token}`)
      .send({})
      .expect(200);
    expect(all.body.data).toEqual({ unread: 0 });
    const after = (await inbox(juana.token).expect(200)).body.data;
    expect(after.unread).toBe(0);
    expect((after.items as { read: boolean }[]).every((item) => item.read)).toBe(true);
  });

  it('solo veo mis notificaciones y no puedo marcar las de otra persona', async () => {
    const juana = await member();
    await circleWithInstallments(juana.userId);
    const juanaItems = (await inbox(juana.token).expect(200)).body.data.items as { id: string }[];

    const pedro = await member();
    const empty = (await inbox(pedro.token).expect(200)).body.data;
    expect(empty).toMatchObject({ items: [], unread: 0, nextCursor: null });

    await http()
      .post('/v1/me/notifications/read')
      .set('Authorization', `Bearer ${pedro.token}`)
      .send({ ids: juanaItems.map((item) => item.id) })
      .expect(200);
    expect((await inbox(juana.token).expect(200)).body.data.unread).toBe(juanaItems.length);

    await http()
      .post('/v1/me/notifications/read')
      .set('Authorization', `Bearer ${pedro.token}`)
      .send({ ids: ['no-es-uuid'] })
      .expect(400);
    await http().get('/v1/me/notifications').expect(401);
  });

  /** Aviso en el celular (COPAYNI-85). En pruebas el proveedor es el doble (`PUSH_PROVIDER=fake`). */
  describe('push', () => {
    const TOKEN = 'ExponentPushToken[eeeeeeeeeeeeeeeeeeeeee]';

    const pendingPushOf = async (userId: string): Promise<number> => {
      const rows = await database.query<{ count: number }[]>(
        `SELECT count(*)::int AS count FROM notifications
          WHERE user_id = $1 AND pushed_at IS NULL`,
        [userId],
      );
      return rows[0]?.count ?? 0;
    };

    it('registra el dispositivo, envía una sola vez y no repite al día siguiente', async () => {
      const juana = await member();
      await circleWithInstallments(juana.userId);

      await http()
        .post('/v1/me/devices')
        .set('Authorization', `Bearer ${juana.token}`)
        .send({ token: TOKEN, platform: 'android' })
        .expect(200);
      // Registrar el mismo token otra vez no duplica el dispositivo.
      const again = await http()
        .post('/v1/me/devices')
        .set('Authorization', `Bearer ${juana.token}`)
        .send({ token: TOKEN, platform: 'android' })
        .expect(200);
      const devices = await database.query<{ count: number }[]>(
        'SELECT count(*)::int AS count FROM user_push_devices WHERE token = $1',
        [TOKEN],
      );
      expect(devices[0]?.count).toBe(1);
      expect(again.body.data.deviceId).toBeDefined();

      await app.get(SyncNotificationsUseCase).execute(juana.userId);
      expect(await pendingPushOf(juana.userId)).toBeGreaterThan(0);

      const run = await app.get(SendPendingPushUseCase).execute();
      expect(run.sent).toBeGreaterThan(0);
      expect(await pendingPushOf(juana.userId)).toBe(0);

      // Una segunda corrida no vuelve a avisar lo mismo.
      const second = await app.get(SendPendingPushUseCase).execute();
      expect(second.sent).toBe(0);
    });

    it('con la categoría apagada no se envía, y la bandeja la sigue mostrando', async () => {
      const juana = await member();
      await circleWithInstallments(juana.userId);
      await http()
        .post('/v1/me/devices')
        .set('Authorization', `Bearer ${juana.token}`)
        .send({ token: 'ExponentPushToken[ffffffffffffffffffffff]', platform: 'ios' })
        .expect(200);

      const saved = await http()
        .put('/v1/me/notification-preferences')
        .set('Authorization', `Bearer ${juana.token}`)
        .send({ categories: { payments: false } })
        .expect(200);
      expect(saved.body.data).toEqual({
        pushEnabled: true,
        categories: { payments: false, circles: true, account: true },
      });

      await app.get(SyncNotificationsUseCase).execute(juana.userId);
      const run = await app.get(SendPendingPushUseCase).execute();
      // Los avisos de pagos se descartan; los de la junta sí salen.
      expect(run.skipped).toBeGreaterThan(0);
      const inboxTypes = (
        (await inbox(juana.token).expect(200)).body.data.items as {
          type: string;
        }[]
      ).map((item) => item.type);
      expect(inboxTypes).toContain('installment_due_today');
    });

    it('al cerrar sesión ese celular deja de recibir avisos', async () => {
      const juana = await member();
      const token = 'ExponentPushToken[gggggggggggggggggggggg]';
      await http()
        .post('/v1/me/devices')
        .set('Authorization', `Bearer ${juana.token}`)
        .send({ token, platform: 'android' })
        .expect(200);
      await http()
        .delete(`/v1/me/devices/${encodeURIComponent(token)}`)
        .set('Authorization', `Bearer ${juana.token}`)
        .expect(204);
      const rows = await database.query<{ disabled_reason: string | null }[]>(
        'SELECT disabled_reason FROM user_push_devices WHERE token = $1',
        [token],
      );
      expect(rows[0]?.disabled_reason).toBe('signed_out');
    });

    it('las preferencias empiezan todas activadas y exigen sesión', async () => {
      const juana = await member();
      const current = await http()
        .get('/v1/me/notification-preferences')
        .set('Authorization', `Bearer ${juana.token}`)
        .expect(200);
      expect(current.body.data).toEqual({
        pushEnabled: true,
        categories: { payments: true, circles: true, account: true },
      });

      await http().get('/v1/me/notification-preferences').expect(401);
      await http().post('/v1/me/devices').send({ token: TOKEN, platform: 'android' }).expect(401);
      await http()
        .post('/v1/me/devices')
        .set('Authorization', `Bearer ${juana.token}`)
        .send({ token: 'fcm:abc', platform: 'android' })
        .expect(400);
      await http()
        .post('/v1/me/devices')
        .set('Authorization', `Bearer ${juana.token}`)
        .send({ token: TOKEN, platform: 'web' })
        .expect(400);
    });
  });

  it('pagina de la más reciente a la más antigua', async () => {
    const juana = await member();
    await circleWithInstallments(juana.userId);
    const first = (await inbox(juana.token, '?limit=3').expect(200)).body.data;
    expect(first.items).toHaveLength(3);
    const second = (
      await inbox(juana.token, `?limit=10&cursor=${first.nextCursor as string}`).expect(200)
    ).body.data;
    expect(second.items).toHaveLength(3);
    expect(second.nextCursor).toBeNull();
    const ids = [...first.items, ...second.items].map((item: { id: string }) => item.id);
    expect(new Set(ids).size).toBe(6);
  });
});
