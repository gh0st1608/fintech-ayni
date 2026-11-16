import { randomUUID } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { SqlNotificationsRepository } from '@src/modules/notifications/infrastructure/sql-notifications.repository';
import {
  SqlNotificationPreferencesRepository,
  SqlPushDevicesRepository,
} from '@src/modules/notifications/infrastructure/sql-push-devices.repository';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

const AT = new Date('2026-11-16T15:00:00Z');
const token = () => `ExponentPushToken[${randomUUID().replace(/-/g, '')}]`;

/** Dispositivos, preferencias y cola de envío sobre PostgreSQL (COPAYNI-85). */
describe('Push sobre PostgreSQL (COPAYNI-85)', () => {
  let dataSource: DataSource;
  let notifications: SqlNotificationsRepository;
  let devices: SqlPushDevicesRepository;
  let preferences: SqlNotificationPreferencesRepository;

  beforeAll(async () => {
    dataSource = await openTestDatabase([]);
    notifications = new SqlNotificationsRepository(dataSource);
    devices = new SqlPushDevicesRepository(dataSource);
    preferences = new SqlNotificationPreferencesRepository(dataSource);
  });

  afterAll(() => dataSource.destroy());

  /** Una notificación pendiente de enviar, como la deja la sincronización de la bandeja. */
  async function notification(
    userId: string,
    overrides: { createdAt?: Date; pushedAt?: Date | null; attempts?: number } = {},
  ): Promise<string> {
    const id = randomUUID();
    await dataSource.query(
      `INSERT INTO notifications
         (id, user_id, type, category, data, dedupe_key, occurred_at, created_at, pushed_at,
          push_attempts)
       VALUES ($1, $2, 'installment_due_today', 'payments',
               jsonb_build_object('amount', jsonb_build_object('amount', 300000,
                                                               'currency', 'PEN')),
               $3, now(), $4, $5, $6)`,
      [
        id,
        userId,
        `test:${id}`,
        overrides.createdAt ?? AT,
        overrides.pushedAt ?? null,
        overrides.attempts ?? 0,
      ],
    );
    return id;
  }

  const pendingIds = async (): Promise<string[]> =>
    (await notifications.pendingPush({ limit: 100, maxAttempts: 3 })).map(
      (item) => item.notificationId,
    );

  describe('cola de envío', () => {
    it('devuelve lo pendiente con el idioma del perfil y en orden de llegada', async () => {
      const userId = await insertTestUser(dataSource);
      await dataSource.query('UPDATE users SET preferred_language = $2 WHERE id = $1', [
        userId,
        'en-US',
      ]);
      const older = await notification(userId, { createdAt: new Date('2026-11-16T10:00:00Z') });
      const newer = await notification(userId, { createdAt: new Date('2026-11-16T14:00:00Z') });

      const pending = (await notifications.pendingPush({ limit: 100, maxAttempts: 3 })).filter(
        (item) => item.userId === userId,
      );
      expect(pending.map((item) => item.notificationId)).toEqual([older, newer]);
      expect(pending[0]).toMatchObject({
        type: 'installment_due_today',
        category: 'payments',
        language: 'en',
        data: { amount: { amount: 300_000, currency: 'PEN' } },
      });
    });

    it('sin idioma en el perfil, el aviso va en español', async () => {
      const userId = await insertTestUser(dataSource);
      const id = await notification(userId);
      const pending = await notifications.pendingPush({ limit: 100, maxAttempts: 3 });
      expect(pending.find((item) => item.notificationId === id)?.language).toBe('es');
    });

    it('no devuelve las ya enviadas ni las de quien está bloqueado', async () => {
      const userId = await insertTestUser(dataSource);
      const sent = await notification(userId, { pushedAt: AT });
      const blockedUser = await insertTestUser(dataSource);
      // La base exige el motivo junto con el bloqueo (ck_users_blocked_reason).
      await dataSource.query(
        "UPDATE users SET blocked_at = now(), blocked_reason = 'prueba' WHERE id = $1",
        [blockedUser],
      );
      const ofBlocked = await notification(blockedUser);

      const ids = await pendingIds();
      expect(ids).not.toContain(sent);
      expect(ids).not.toContain(ofBlocked);
    });

    it('marcar enviado saca el aviso de la cola, y repetirlo no cambia nada', async () => {
      const userId = await insertTestUser(dataSource);
      const id = await notification(userId);
      await expect(notifications.markPushed([id], AT)).resolves.toBe(1);
      expect(await pendingIds()).not.toContain(id);
      // Ya estaba marcado: una segunda corrida no vuelve a tocarlo.
      await expect(notifications.markPushed([id], AT)).resolves.toBe(0);
    });

    it('sin ids no consulta la base', async () => {
      await expect(notifications.markPushed([], AT)).resolves.toBe(0);
      await expect(notifications.markPushAttempt([])).resolves.toBe(0);
    });

    it('un aviso que agota sus intentos deja de salir en la cola', async () => {
      const userId = await insertTestUser(dataSource);
      const id = await notification(userId);
      await expect(notifications.markPushAttempt([id])).resolves.toBe(1);
      // Con un intento sigue pendiente: se reintenta mañana.
      expect(await pendingIds()).toContain(id);
      await notifications.markPushAttempt([id]);
      await notifications.markPushAttempt([id]);
      expect(await pendingIds()).not.toContain(id);
    });
  });

  describe('dispositivos', () => {
    it('registrar el mismo token dos veces no duplica el dispositivo', async () => {
      const userId = await insertTestUser(dataSource);
      const value = token();
      const first = await devices.register({ userId, token: value, platform: 'android' });
      const second = await devices.register({ userId, token: value, platform: 'ios' });
      expect(second.id).toBe(first.id);
      expect(second.platform).toBe('ios');
      await expect(devices.activeOf(userId)).resolves.toHaveLength(1);
    });

    it('si el celular pasa a otra cuenta, el token cambia de dueño', async () => {
      const first = await insertTestUser(dataSource);
      const second = await insertTestUser(dataSource);
      const value = token();
      await devices.register({ userId: first, token: value, platform: 'android' });
      await devices.register({ userId: second, token: value, platform: 'android' });
      await expect(devices.activeOf(first)).resolves.toEqual([]);
      await expect(devices.activeOf(second)).resolves.toHaveLength(1);
    });

    it('un token apagado no recibe, y volver a registrarlo lo reactiva', async () => {
      const userId = await insertTestUser(dataSource);
      const value = token();
      await devices.register({ userId, token: value, platform: 'android' });

      await expect(devices.disable(value, 'unregistered', AT)).resolves.toBe(true);
      await expect(devices.activeOf(userId)).resolves.toEqual([]);
      // Ya estaba apagado: no se vuelve a apagar.
      await expect(devices.disable(value, 'signed_out', AT)).resolves.toBe(false);

      await devices.register({ userId, token: value, platform: 'android' });
      await expect(devices.activeOf(userId)).resolves.toHaveLength(1);
    });

    it('apagar un token que no existe no falla', async () => {
      await expect(devices.disable(token(), 'signed_out', AT)).resolves.toBe(false);
    });
  });

  describe('preferencias', () => {
    it('quien no las tocó recibe todo', async () => {
      const userId = await insertTestUser(dataSource);
      await expect(preferences.of(userId)).resolves.toEqual({
        pushEnabled: true,
        categories: { payments: true, circles: true, account: true },
      });
    });

    it('guarda y vuelve a guardar sobre la misma fila', async () => {
      const userId = await insertTestUser(dataSource);
      await preferences.save(
        userId,
        { pushEnabled: true, categories: { payments: false, circles: true, account: true } },
        AT,
      );
      await expect(preferences.of(userId)).resolves.toMatchObject({
        categories: { payments: false },
      });

      await preferences.save(
        userId,
        { pushEnabled: false, categories: { payments: true, circles: false, account: true } },
        AT,
      );
      await expect(preferences.of(userId)).resolves.toEqual({
        pushEnabled: false,
        categories: { payments: true, circles: false, account: true },
      });
      const rows = await dataSource.query<{ count: number }[]>(
        'SELECT count(*)::int AS count FROM notification_preferences WHERE user_id = $1',
        [userId],
      );
      expect(rows[0]?.count).toBe(1);
    });
  });
});
