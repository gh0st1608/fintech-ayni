import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { CircleCycle } from '@src/modules/circles/domain/entities/circle-cycle';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { CircleMembershipEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle.entity';
import { TypeOrmCircleCycleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle-cycle.repository';
import { TypeOrmCircleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle.repository';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { TEST_PRICING } from '@test/support/join-circle.fixture';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

const MONTHS = 6;
/** Lima es UTC-5: las 17:00 UTC son mediodía del día indicado. */
const at = (date: string) => new Date(`${date}T17:00:00Z`);

/**
 * El ciclo mensual contra PostgreSQL (COPAYNI-56): guardado, bloqueo e idempotencia. Otros
 * archivos crean círculos en la misma base, así que la tarea se limita a los de este archivo.
 */
describe('TypeOrmCircleCycleRepository', () => {
  let dataSource: DataSource;
  let circles: TypeOrmCircleRepository;
  let cycles: TypeOrmCircleCycleRepository;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    dataSource = await openTestDatabase([CircleEntity, CircleMembershipEntity]);
    circles = new TypeOrmCircleRepository(
      dataSource.getRepository(CircleEntity),
      dataSource.getRepository(CircleMembershipEntity),
    );
    cycles = new TypeOrmCircleCycleRepository(dataSource.getRepository(CircleEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
    jest.restoreAllMocks();
  });

  /** Un círculo lleno de 6 meses desde `startsOn`, con el precio congelado de cada miembro. */
  async function fullCircle(startsOn = Period.of(2026, 11)) {
    const id = randomUUID();
    const terms = CircleTerms.create({
      payout: Money.of(600_000, 'PEN'),
      months: MONTHS,
      startsOn,
    });
    const members = [];
    for (let position = 1; position <= MONTHS; position += 1) {
      members.push({
        userId: await insertTestUser(dataSource),
        position,
        idempotencyKey: `k-${id}-${position}`,
        price: priceOf(TEST_PRICING.quote(terms, position)),
      });
    }
    await circles.create(Circle.restore({ id, terms, memberships: members }));
    return { id, members };
  }

  /** La tarea diaria, limitada a `circleIds`. */
  function job(circleIds: string[]) {
    const clock = new TestClock();
    const useCase = new AdvanceCircleCyclesUseCase(
      { listToAdvance: () => Promise.resolve(circleIds), withLock: cycles.withLock.bind(cycles) },
      TEST_PRICING,
      { dueDay: 5, timeZone: 'America/Lima' },
      new FakeCyclePayments(),
      new FakeCyclePayments(),
      clock,
    );
    return (date: string) => {
      clock.set(at(date));
      return useCase.execute();
    };
  }

  const count = async (table: 'circle_installments' | 'circle_payouts', circleId: string) => {
    const [row] = await dataSource.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM ${table} WHERE circle_id = $1`,
      [circleId],
    );
    return row!.total;
  };

  it('un círculo de 6 meses llega a finished y queda en Mis círculos finalizados', async () => {
    const { id, members } = await fullCircle();
    const runOn = job([id]);
    for (const date of ['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05']) {
      await runOn(date);
    }
    await expect(runOn('2027-04-05')).resolves.toEqual({ advanced: 1, locked: 0, failed: 0 });

    const [circle] = await dataSource.query<{ cycle_state: string; current_period: null }[]>(
      'SELECT cycle_state, current_period FROM circles WHERE id = $1',
      [id],
    );
    expect(circle).toEqual({ cycle_state: 'finished', current_period: null });
    expect(await count('circle_installments', id)).toBe(MONTHS * MONTHS);
    const payouts = await dataSource.query<
      { user_id: string; period: string; amount: string; paid: boolean }[]
    >(
      `SELECT p.user_id, to_char(p.period, 'YYYY-MM') AS period, p.amount::text AS amount
         FROM circle_payouts p WHERE p.circle_id = $1 ORDER BY p.period`,
      [id],
    );
    expect(payouts.map(({ user_id }) => user_id)).toEqual(members.map(({ userId }) => userId));
    expect(payouts[0]).toMatchObject({
      period: '2026-11',
      amount: String(members[0]!.price.netPayout.amount),
    });
    const unpaid = await dataSource.query<unknown[]>(
      `SELECT 1 FROM circle_installments
        WHERE circle_id = $1 AND (status <> 'paid' OR paid_at IS NULL)`,
      [id],
    );
    expect(unpaid).toEqual([]);

    const finished = await circles.listMemberships({
      userId: members[0]!.userId,
      status: 'finished',
      limit: 5,
      cursor: null,
    });
    expect(finished.items.map(({ circleId }) => circleId)).toEqual([id]);
  });

  it('ejecutarla dos veces el mismo día no duplica cuotas ni payouts', async () => {
    const { id } = await fullCircle();
    const runOn = job([id]);
    await runOn('2026-11-05');
    await runOn('2026-11-05');

    expect(await count('circle_payouts', id)).toBe(1);
    // Las del primer mes y las del segundo, ya abiertas.
    expect(await count('circle_installments', id)).toBe(MONTHS * 2);
  });

  it('una segunda ejecución simultánea no procesa el círculo bloqueado', async () => {
    const { id } = await fullCircle();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let entered!: () => void;
    const inside = new Promise<void>((resolve) => (entered = resolve));

    const first = cycles.withLock(id, async (stored) => {
      entered();
      await gate;
      return CircleCycle.restore({ ...stored, dueDay: 5, members: [] });
    });
    await inside;
    await expect(
      cycles.withLock(id, () => Promise.reject(new Error('no debía ejecutarse'))),
    ).resolves.toBe(false);
    release();
    await expect(first).resolves.toBe(true);
  });

  it('si el trabajo falla, no guarda nada', async () => {
    const { id } = await fullCircle();
    await expect(
      cycles.withLock(id, (stored) => {
        const cycle = CircleCycle.restore({ ...stored, dueDay: 5, members: [] });
        cycle.start(randomUUID);
        return Promise.reject(new Error('falla del proveedor'));
      }),
    ).rejects.toThrow('falla del proveedor');

    const [circle] = await dataSource.query<{ cycle_state: string }[]>(
      'SELECT cycle_state FROM circles WHERE id = $1',
      [id],
    );
    expect(circle?.cycle_state).toBe('collecting');
  });

  it('lista los círculos en curso y los que llegaron a su mes de inicio', async () => {
    const started = await fullCircle(Period.of(2026, 11));
    const upcoming = await fullCircle(Period.of(2027, 6));
    await job([started.id])('2026-11-05');

    const due = await cycles.listToAdvance(Period.of(2026, 12));
    expect(due).toContain(started.id);
    expect(due).not.toContain(upcoming.id);
    expect(await cycles.listToAdvance(Period.of(2027, 6))).toContain(upcoming.id);
  });

  it('un círculo inexistente falla', async () => {
    await expect(
      cycles.withLock(randomUUID(), () => Promise.reject(new Error('x'))),
    ).rejects.toThrow('No existe el círculo');
  });
});
