import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { CircleMembershipEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle.entity';
import { SqlStartProposalsRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/sql-start-proposals.repository';
import { TypeOrmCircleCycleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle-cycle.repository';
import { TypeOrmCircleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle.repository';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING,
} from '@test/support/join-circle.fixture';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

/** Lima es UTC-5: las 17:00 UTC son mediodía del día indicado. */
const at = (date: string) => new Date(`${date}T17:00:00Z`);

/** Aprobación del inicio contra PostgreSQL (COPAYNI-62). */
describe('aprobación del inicio de un círculo incompleto', () => {
  let dataSource: DataSource;
  let circles: TypeOrmCircleRepository;
  let cycles: TypeOrmCircleCycleRepository;
  let proposals: SqlStartProposalsRepository;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    dataSource = await openTestDatabase([CircleEntity, CircleMembershipEntity]);
    circles = new TypeOrmCircleRepository(
      dataSource.getRepository(CircleEntity),
      dataSource.getRepository(CircleMembershipEntity),
    );
    cycles = new TypeOrmCircleCycleRepository(dataSource.getRepository(CircleEntity));
    proposals = new SqlStartProposalsRepository(dataSource);
  });

  afterAll(async () => {
    await dataSource.destroy();
    jest.restoreAllMocks();
  });

  /** 6 turnos con cuota base de 1.000; ocupados los de `positions`. */
  async function partialCircle(positions: number[]) {
    const id = randomUUID();
    const terms = CircleTerms.create({
      payout: Money.of(600_000, 'PEN'),
      months: 6,
      startsOn: Period.of(2026, 11),
    });
    const members = [];
    for (const position of positions) {
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

  function job(circleId: string) {
    const clock = new TestClock();
    const payments = new FakeCyclePayments();
    const useCase = new AdvanceCircleCyclesUseCase(
      { listToAdvance: () => Promise.resolve([circleId]), withLock: cycles.withLock.bind(cycles) },
      TEST_PRICING,
      {
        dueDay: 5,
        timeZone: 'America/Lima',
        delinquency: TEST_DELINQUENCY,
        fundFeeShareBps: TEST_FUND_SHARE_BPS,
        startApprovalDays: 7,
      },
      payments,
      payments,
      clock,
    );
    return (date: string) => {
      clock.set(at(date));
      return useCase.execute();
    };
  }

  const circleRow = async (id: string) => {
    const [row] = await dataSource.query<
      { cycle_state: string; months: number; payout_amount: string; starts_on: string }[]
    >(
      `SELECT cycle_state, months, payout_amount::text AS payout_amount,
              to_char(starts_on, 'YYYY-MM') AS starts_on
         FROM circles WHERE id = $1`,
      [id],
    );
    return row!;
  };

  const memberships = (id: string) =>
    dataSource.query<{ user_id: string; position: number; price: { installments: unknown[] } }[]>(
      'SELECT user_id, position, price FROM circle_memberships WHERE circle_id = $1 ORDER BY position',
      [id],
    );

  it('propone, muestra el turno nuevo y empieza con todo guardado', async () => {
    const { id, members } = await partialCircle([2, 3, 5, 6]);
    const runOn = job(id);
    await runOn('2026-11-02');

    expect((await circleRow(id)).cycle_state).toBe('approving');
    const [proposal] = await proposals.listFor(members[1]!.userId);
    expect(proposal).toMatchObject({ circleId: id, position: 2, decision: null });
    expect(proposal?.proposed.months).toBe(4);
    expect(proposal?.proposed.payout.amount).toBe(400_000);
    expect(proposal?.respondBy.toString()).toBe('2026-11-09');

    for (const { userId } of members) await proposals.respond(id, userId, 'accepted');
    await runOn('2026-11-03');

    expect(await circleRow(id)).toEqual({
      cycle_state: 'contributing',
      months: 4,
      payout_amount: '400000',
      starts_on: '2026-11',
    });
    const saved = await memberships(id);
    expect(saved.map(({ position }) => position)).toEqual([1, 2, 3, 4]);
    expect(saved.map(({ user_id }) => user_id)).toEqual(members.map(({ userId }) => userId));
    expect(saved.every(({ price }) => price.installments.length === 4)).toBe(true);
    await expect(proposals.listFor(members[0]!.userId)).resolves.toEqual([]);
  });

  it('quien se retira sale del círculo y los demás vuelven a decidir', async () => {
    const { id, members } = await partialCircle([1, 2, 4]);
    const runOn = job(id);
    await runOn('2026-11-02');
    await proposals.respond(id, members[0]!.userId, 'accepted');
    await proposals.respond(id, members[1]!.userId, 'accepted');
    await proposals.respond(id, members[2]!.userId, 'withdrawn');
    await runOn('2026-11-03');

    expect((await circleRow(id)).cycle_state).toBe('approving');
    expect((await memberships(id)).map(({ user_id }) => user_id)).toEqual(
      members.slice(0, 2).map(({ userId }) => userId),
    );
    const [proposal] = await proposals.listFor(members[0]!.userId);
    expect(proposal?.proposed.months).toBe(2);
    expect(proposal?.decision).toBeNull();
    await expect(proposals.listFor(members[2]!.userId)).resolves.toEqual([]);
  });

  it('si no alcanza, cancela sin abrir cuotas', async () => {
    const { id, members } = await partialCircle([1, 2]);
    const runOn = job(id);
    await runOn('2026-11-02');
    await proposals.respond(id, members[0]!.userId, 'withdrawn');
    await proposals.respond(id, members[1]!.userId, 'withdrawn');
    await runOn('2026-11-03');

    expect((await circleRow(id)).cycle_state).toBe('cancelled');
    await expect(memberships(id)).resolves.toEqual([]);
    const [row] = await dataSource.query<{ total: number }[]>(
      'SELECT count(*)::int AS total FROM circle_installments WHERE circle_id = $1',
      [id],
    );
    expect(row?.total).toBe(0);
  });

  it('no acepta respuestas de quien no es miembro', async () => {
    const { id } = await partialCircle([1, 2]);
    await job(id)('2026-11-02');
    const stranger = await insertTestUser(dataSource);
    await expect(proposals.respond(id, stranger, 'accepted')).rejects.toMatchObject({
      code: 'START_PROPOSAL_NOT_FOUND',
    });
  });
});
