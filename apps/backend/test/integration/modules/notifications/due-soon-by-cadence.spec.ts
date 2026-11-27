import { randomUUID } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { type CadenceId } from '@src/modules/circles/domain/value-objects/cadence';
import { type NotificationData } from '@src/modules/notifications/domain/notification';
import { SqlNotificationsRepository } from '@src/modules/notifications/infrastructure/sql-notifications.repository';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

/**
 * La antelación del recordatorio, por cadencia, sobre PostgreSQL (COPAYNI-120).
 *
 * El recordatorio se manda 3 días antes del vencimiento. En un ciclo de 30 es razonable; en uno
 * de 7 llega casi pegado al turno anterior, y a lo largo del año son 52 avisos en lugar de 12.
 * La antelación se configura por cadencia y con 0 no se manda: queda solo el del vencimiento.
 *
 * Se prueba contra la base porque la regla vive en el `SELECT` de la proyección, no en TypeScript.
 */
const TODAY = '2026-11-16';

describe('Recordatorio por cadencia sobre PostgreSQL (COPAYNI-120)', () => {
  let dataSource: DataSource;
  let notifications: SqlNotificationsRepository;

  beforeAll(async () => {
    dataSource = await openTestDatabase([]);
    notifications = new SqlNotificationsRepository(dataSource);
  });

  afterAll(() => dataSource.destroy());

  /** Una junta en curso con una cuota pendiente que vence el día indicado. */
  async function circleWithInstallment(props: {
    cadence: CadenceId;
    dueOn: string;
    turns?: number;
  }): Promise<string> {
    const userId = await insertTestUser(dataSource);
    const circleId = randomUUID();
    await dataSource.query(
      `INSERT INTO circles (id, payout_amount, currency, turns, cadence, starts_on, cycle_state,
                            current_period, current_turn)
       VALUES ($1, 1200000, 'PEN', $2, $3, '2026-11-04', 'contributing', '2026-11-01', 1)`,
      [circleId, props.turns ?? 4, props.cadence],
    );
    await dataSource.query(
      `INSERT INTO circle_memberships (id, circle_id, user_id, position, idempotency_key)
       VALUES ($1, $2, $3, 1, $4)`,
      [randomUUID(), circleId, userId, `key-${circleId}`],
    );
    await dataSource.query(
      `INSERT INTO circle_installments (id, circle_id, user_id, position, turn, period, due_on,
                                        amount, currency, status)
       VALUES ($1, $2, $3, 1, 1, date_trunc('month', $4::date), $4::date, 300000, 'PEN',
               'pending')`,
      [randomUUID(), circleId, userId, props.dueOn],
    );
    return userId;
  }

  /**
   * Los avisos de **su cuota** que la proyección le genera. La junta en curso genera además el
   * aviso de inicio y el de su turno de cobro, que no dependen de la antelación.
   */
  async function noticesOf(
    userId: string,
    lead: Partial<Record<CadenceId, number>>,
  ): Promise<{ type: string; data: NotificationData }[]> {
    await notifications.project({
      userId,
      today: TODAY,
      dueSoonDays: 3,
      dueSoonDaysByCadence: lead,
    });
    return dataSource.query(
      `SELECT type, data FROM notifications
        WHERE user_id = $1 AND type LIKE 'installment_%' ORDER BY type`,
      [userId],
    );
  }

  it('una junta mensual conserva sus 3 días de antelación', async () => {
    // Vence el 19 y hoy es el 16: entra en la ventana de 3 días, como antes de la épica.
    const userId = await circleWithInstallment({ cadence: 'monthly', dueOn: '2026-11-19' });

    const notices = await noticesOf(userId, {});

    expect(notices.map(({ type }) => type)).toEqual(['installment_due_soon']);
    // Y el aviso lleva la cadencia y el turno para poder escribirse en su unidad.
    expect(notices[0]?.data).toMatchObject({ cadence: 'monthly', turn: 1 });
  });

  it('una junta semanal con un día de antelación no avisa tres días antes', async () => {
    const userId = await circleWithInstallment({ cadence: 'weekly', dueOn: '2026-11-19' });

    expect(await noticesOf(userId, { weekly: 1 })).toEqual([]);
  });

  it('y sí avisa el día que le toca', async () => {
    // Vence el 17 y hoy es el 16: con un día de antelación, este es el día del recordatorio.
    const userId = await circleWithInstallment({ cadence: 'weekly', dueOn: '2026-11-17' });

    const notices = await noticesOf(userId, { weekly: 1 });

    expect(notices.map(({ type }) => type)).toEqual(['installment_due_soon']);
    expect(notices[0]?.data).toMatchObject({ cadence: 'weekly', turn: 1 });
  });

  it('con antelación cero no hay recordatorio previo, solo el del vencimiento', async () => {
    const soon = await circleWithInstallment({ cadence: 'weekly', dueOn: '2026-11-17' });
    expect(await noticesOf(soon, { weekly: 0 })).toEqual([]);

    const today = await circleWithInstallment({ cadence: 'weekly', dueOn: TODAY });
    expect((await noticesOf(today, { weekly: 0 })).map(({ type }) => type)).toEqual([
      'installment_due_today',
    ]);
  });

  it('la antelación de una cadencia no afecta a las demás', async () => {
    // La misma fecha de vencimiento, dos cadencias y una sola configuración.
    const monthly = await circleWithInstallment({ cadence: 'monthly', dueOn: '2026-11-18' });
    const weekly = await circleWithInstallment({ cadence: 'weekly', dueOn: '2026-11-18' });

    const lead = { weekly: 1 };
    expect((await noticesOf(monthly, lead)).map(({ type }) => type)).toEqual([
      'installment_due_soon',
    ]);
    expect(await noticesOf(weekly, lead)).toEqual([]);
  });
});
