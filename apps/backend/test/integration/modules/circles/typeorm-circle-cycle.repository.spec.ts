import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { type ContributionsPort } from '@src/modules/circles/application/ports/cycle-payments.port';
import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { SetCirclePauseUseCase } from '@src/modules/circles/application/use-cases/set-circle-pause.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { CircleCycle } from '@src/modules/circles/domain/entities/circle-cycle';
import { priceOf, SlotPricing } from '@src/modules/circles/domain/services/slot-pricing';
import { joinQuote } from '@src/modules/circles/domain/services/vacancy';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { LedgerTransaction } from '@src/modules/circles/domain/value-objects/ledger-transaction';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { CircleMembershipEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle.entity';
import { TypeOrmCircleCycleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle-cycle.repository';
import { TypeOrmCircleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle.repository';
import { TypeOrmMemberDebts } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-member-debts.repository';
import { TypeOrmMemberHistory } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-member-history.repository';
import { TypeOrmPaymentSettings } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-payment-settings.repository';
import { TypeOrmPaymentsQuery } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-payments-query';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING,
  TEST_PRICING_RULES,
} from '@test/support/join-circle.fixture';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

const MONTHS = 6;
/** Lima es UTC-5: las 17:00 UTC son mediodía del día indicado. */
const at = (date: string) => new Date(`${date}T17:00:00Z`);

/**
 * El ciclo mensual contra PostgreSQL (COPAYNI-56 y 57): guardado, bloqueo, idempotencia y
 * expulsión por impago. Otros
 * archivos crean círculos en la misma base, así que la tarea se limita a los de este archivo.
 */
describe('TypeOrmCircleCycleRepository', () => {
  let dataSource: DataSource;
  let circles: TypeOrmCircleRepository;
  let cycles: TypeOrmCircleCycleRepository;
  let debts: TypeOrmMemberDebts;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    dataSource = await openTestDatabase([CircleEntity, CircleMembershipEntity]);
    circles = new TypeOrmCircleRepository(
      dataSource.getRepository(CircleEntity),
      dataSource.getRepository(CircleMembershipEntity),
    );
    cycles = new TypeOrmCircleCycleRepository(dataSource.getRepository(CircleEntity));
    debts = new TypeOrmMemberDebts(dataSource.getRepository(CircleEntity));
  });

  afterAll(async () => {
    await dataSource.destroy();
    jest.restoreAllMocks();
  });

  /** Un círculo lleno de 6 meses desde `startsOn`, con el precio congelado de cada miembro. */
  async function fullCircle(startsOn = Period.of(2026, 11), pricing = TEST_PRICING) {
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
        price: priceOf(pricing.quote(terms, position)),
      });
    }
    await circles.create(Circle.restore({ id, terms, memberships: members }));
    return { id, members };
  }

  /** La tarea diaria, limitada a `circleIds`. */
  function job(circleIds: string[], contributions: ContributionsPort = new FakeCyclePayments()) {
    const clock = new TestClock();
    const useCase = new AdvanceCircleCyclesUseCase(
      { listToAdvance: () => Promise.resolve(circleIds), withLock: cycles.withLock.bind(cycles) },
      TEST_PRICING,
      {
        dueDay: 5,
        timeZone: 'America/Lima',
        delinquency: TEST_DELINQUENCY,
        fundFeeShareBps: TEST_FUND_SHARE_BPS,
      },
      contributions,
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

  it('expulsa al que no pagó en la gracia, registra su deuda y lo desbloquea al saldarla', async () => {
    const { id, members } = await fullCircle();
    const defaulter = members[3]!;
    const runOn = job([id], {
      collect: (installment) =>
        Promise.resolve(installment.userId === defaulter.userId ? 'failed' : 'paid'),
    });
    await runOn('2026-11-05');
    await runOn('2026-11-08');
    await expect(debts.openDebtsOf(defaulter.userId)).resolves.toEqual([]);
    await runOn('2026-11-09');
    await runOn('2026-11-09');

    const installment = defaulter.price.installments[0]!;
    const expulsions = await dataSource.query<Record<string, unknown>[]>(
      `SELECT position, to_char(period, 'YYYY-MM') AS period,
              to_char(expelled_on, 'YYYY-MM-DD') AS expelled_on, overdue_amount::int AS overdue,
              late_fee_amount::int AS late_fee, refund_amount::int AS refund, currency
         FROM circle_expulsions WHERE circle_id = $1`,
      [id],
    );
    expect(expulsions).toEqual([
      {
        position: 4,
        period: '2026-11',
        expelled_on: '2026-11-09',
        overdue: installment.amount,
        late_fee: installment.percentage(300).amount,
        refund: 0,
        currency: 'PEN',
      },
    ]);
    const statuses = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM circle_installments
        WHERE circle_id = $1 AND user_id = $2 ORDER BY period`,
      [id, defaulter.userId],
    );
    expect(statuses).toEqual([{ status: 'defaulted' }]);
    // Noviembre cerró con su cuota incobrable y diciembre se abrió sin él.
    expect(await count('circle_payouts', id)).toBe(1);
    expect(await count('circle_installments', id)).toBe(MONTHS + MONTHS - 1);

    const debt = { circleId: id, overdue: installment, lateFee: installment.percentage(300) };
    await expect(debts.openDebtsOf(defaulter.userId)).resolves.toEqual([debt]);
    const list = (status: 'active' | 'finished') =>
      circles.listMemberships({ userId: defaulter.userId, status, limit: 5, cursor: null });
    expect((await list('active')).items).toEqual([]);
    expect((await list('finished')).items).toEqual([
      expect.objectContaining({ circleId: id, expelled: true }),
    ]);
    expect(
      (
        await circles.listMemberships({
          userId: members[0]!.userId,
          status: 'active',
          limit: 5,
          cursor: null,
        })
      ).items,
    ).toEqual([expect.objectContaining({ circleId: id, expelled: false })]);

    const recovery = ({ overdue, lateFee }: { overdue: Money; lateFee: Money }) =>
      LedgerTransaction.transfer({
        key: `debt_recovered:${id}:${defaulter.userId}`,
        kind: 'debt_recovered',
        from: { account: 'external', userId: defaulter.userId },
        to: { account: 'guarantee_fund' },
        amount: overdue.add(lateFee),
        circleId: id,
      })!;
    await expect(debts.settle(defaulter.userId, id, recovery)).resolves.toEqual(debt);
    await expect(debts.settle(defaulter.userId, id, recovery)).resolves.toBeNull();
    // Lo recuperado vuelve al fondo, una sola vez (COPAYNI-58).
    const recovered = await dataSource.query<{ account: string; amount: string }[]>(
      `SELECT account, amount::text AS amount FROM ledger_entries
        WHERE transaction_key = $1 ORDER BY account`,
      [`debt_recovered:${id}:${defaulter.userId}`],
    );
    const total = installment.add(installment.percentage(300)).amount;
    expect(recovered).toEqual([
      { account: 'external', amount: String(-total) },
      { account: 'guarantee_fund', amount: String(total) },
    ]);
    await expect(debts.openDebtsOf(defaulter.userId)).resolves.toEqual([]);
    await expect(debts.openDebtsOf('no-es-uuid')).resolves.toEqual([]);
    // La deuda saldada aparece en su historial de pagos (COPAYNI-41).
    const history = await new TypeOrmPaymentsQuery(
      dataSource.getRepository(CircleEntity),
    ).transactionsOf({ userId: defaulter.userId, type: 'payment', limit: 10, cursor: null });
    expect(history.items).toEqual([
      expect.objectContaining({
        kind: 'debt_settlement',
        circleId: id,
        amount: Money.of(total, 'PEN'),
      }),
    ]);
    await expect(debts.settle('no-es-uuid', id, recovery)).resolves.toBeNull();
  });

  it('la retención paga las últimas cuotas de la primera mitad y cuenta la confianza (COPAYNI-60)', async () => {
    const retaining = new SlotPricing(
      SlotPricingRules.create({ ...TEST_PRICING_RULES.props, retentionInstallments: 2 }),
    );
    const { id, members } = await fullCircle(Period.of(2026, 11), retaining);
    const history = new TypeOrmMemberHistory(dataSource.getRepository(CircleEntity));
    await expect(history.completedCirclesOf(members[0]!.userId)).resolves.toBe(0);
    const runOn = job([id]);
    for (const month of [11, 12, 1, 2, 3, 4]) {
      await runOn(`${month > 10 ? 2026 : 2027}-${String(month).padStart(2, '0')}-05`);
    }

    // Turnos 1 a 3 (primera mitad): sus 2 últimas cuotas las paga la retención.
    const retained = await dataSource.query<{ position: number; period: string }[]>(
      `SELECT position, to_char(period, 'YYYY-MM') AS period FROM circle_installments
        WHERE circle_id = $1 AND status = 'retained' ORDER BY position, period`,
      [id],
    );
    expect(retained).toEqual(
      [1, 2, 3].flatMap((position) => [
        { position, period: '2027-03' },
        { position, period: '2027-04' },
      ]),
    );
    const kinds = await dataSource.query<{ kind: string; total: number }[]>(
      `SELECT kind, count(*)::int AS total FROM ledger_transactions
        WHERE circle_id = $1 AND kind LIKE 'retention%' GROUP BY kind ORDER BY kind`,
      [id],
    );
    expect(kinds).toEqual([
      { kind: 'retention_applied', total: 6 },
      { kind: 'retention_held', total: 3 },
    ]);
    const [held] = await dataSource.query<{ total: string }[]>(
      `SELECT COALESCE(sum(e.amount), 0)::text AS total FROM ledger_entries e
         JOIN ledger_transactions t ON t.key = e.transaction_key
        WHERE t.circle_id = $1 AND e.account = 'retention_held'`,
      [id],
    );
    expect(held?.total).toBe('0');
    await expect(history.completedCirclesOf(members[0]!.userId)).resolves.toBe(1);
    await expect(history.completedCirclesOf('no-es-uuid')).resolves.toBe(0);
  });

  it('un miembro nuevo toma la vacante del expulsado y cobra su turno (COPAYNI-59)', async () => {
    const { id, members } = await fullCircle();
    const defaulter = members[3]!;
    const runOn = job([id], {
      collect: (installment) =>
        Promise.resolve(installment.userId === defaulter.userId ? 'failed' : 'paid'),
    });
    await runOn('2026-11-05');
    await runOn('2026-11-09');

    const circle = (await circles.findById(id))!;
    expect(circle.running).toEqual({ vacancies: [4] });
    expect(circle.availablePositions()).toEqual([4]);
    const outsider = await insertTestUser(dataSource);
    const joinable = await circles.listJoinable({
      startsAfter: Period.of(2026, 12),
      userId: outsider,
      limit: 500,
    });
    expect(joinable.map(({ id: circleId }) => circleId)).toContain(id);
    const forMember = await circles.listJoinable({
      startsAfter: Period.of(2026, 12),
      userId: members[0]!.userId,
      limit: 500,
    });
    expect(forMember.map(({ id: circleId }) => circleId)).not.toContain(id);

    // Dos usuarios toman la vacante a la vez el 2 de diciembre: gana uno (índice parcial).
    const quote = joinQuote(TEST_PRICING, circle, 4, LocalDate.parse('2026-12-02'), 5);
    const rival = await insertTestUser(dataSource);
    const results = await Promise.allSettled(
      [outsider, rival].map((userId) =>
        circles.addMembership(id, {
          userId,
          position: 4,
          idempotencyKey: `k-${id}-${userId}`,
          price: priceOf(quote),
        }),
      ),
    );
    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'SLOT_TAKEN' }),
    });
    const winner = results[0]!.status === 'fulfilled' ? outsider : rival;
    expect((await circles.findById(id))!.running).toEqual({ vacancies: [] });

    const all = job([id]);
    for (const date of ['2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05', '2027-04-05']) {
      await all(date);
    }
    const payouts = await dataSource.query<{ position: number; user_id: string }[]>(
      'SELECT position, user_id FROM circle_payouts WHERE circle_id = $1 ORDER BY period',
      [id],
    );
    expect(payouts).toHaveLength(MONTHS);
    expect(payouts.find(({ position }) => position === 4)?.user_id).toBe(winner);
    // La puesta al día (la cuota base de noviembre) entró al fondo con sus cuotas.
    const [catchUp] = await dataSource.query<{ total: string }[]>(
      `SELECT sum(e.amount)::text AS total FROM ledger_entries e
         JOIN ledger_transactions t ON t.key = e.transaction_key
        WHERE t.circle_id = $1 AND t.kind = 'collection' AND e.account = 'guarantee_fund'`,
      [id],
    );
    expect(catchUp?.total).toBe(String(100_000));
    const [pot] = await dataSource.query<{ total: string }[]>(
      `SELECT COALESCE(sum(e.amount), 0)::text AS total FROM ledger_entries e
         JOIN ledger_transactions t ON t.key = e.transaction_key
        WHERE t.circle_id = $1 AND e.account = 'circle_pot'`,
      [id],
    );
    expect(pot?.total).toBe('0');
  });

  it('pausa y reanuda en otro mes: corre el calendario y audita (COPAYNI-61)', async () => {
    const { id } = await fullCircle();
    await job([id])('2026-11-02');
    const clock = new TestClock(at('2026-11-03'));
    const settings = {
      dueDay: 5,
      timeZone: 'America/Lima',
      delinquency: TEST_DELINQUENCY,
      fundFeeShareBps: TEST_FUND_SHARE_BPS,
    };
    const pause = new SetCirclePauseUseCase(cycles, TEST_PRICING, settings, clock);
    const command = { circleId: id, actorId: 'staff-1', reason: 'Reclamo' };
    await pause.execute({ ...command, action: 'pause' });
    await pause.execute({ ...command, action: 'pause' });
    const state = () =>
      dataSource.query<Record<string, string | null>[]>(
        `SELECT cycle_state, to_char(paused_on, 'YYYY-MM-DD') AS paused_on,
                to_char(starts_on, 'YYYY-MM') AS starts_on,
                to_char(current_period, 'YYYY-MM') AS current_period
           FROM circles WHERE id = $1`,
        [id],
      );
    expect(await state()).toEqual([
      {
        cycle_state: 'paused',
        paused_on: '2026-11-03',
        starts_on: '2026-11',
        current_period: '2026-11',
      },
    ]);
    // La tarea diaria no avanza un círculo pausado.
    expect(await cycles.listToAdvance(Period.of(2026, 11))).not.toContain(id);

    clock.set(at('2026-12-02'));
    await pause.execute({ ...command, action: 'resume', reason: 'Resuelto' });
    expect(await state()).toEqual([
      {
        cycle_state: 'contributing',
        paused_on: null,
        starts_on: '2026-12',
        current_period: '2026-12',
      },
    ]);
    const installments = await dataSource.query<{ period: string; due_on: string }[]>(
      `SELECT DISTINCT to_char(period, 'YYYY-MM') AS period, to_char(due_on, 'YYYY-MM-DD') AS due_on
         FROM circle_installments WHERE circle_id = $1`,
      [id],
    );
    expect(installments).toEqual([{ period: '2026-12', due_on: '2026-12-05' }]);
    const events = await dataSource.query<{ action: string; actor_id: string; after: unknown }[]>(
      'SELECT action, actor_id, after FROM circle_admin_events WHERE circle_id = $1 ORDER BY created_at',
      [id],
    );
    expect(events).toEqual([
      expect.objectContaining({ action: 'pause', actor_id: 'staff-1' }),
      expect.objectContaining({
        action: 'resume',
        after: expect.objectContaining({ startsOn: '2026-12', endsOn: '2027-05' }),
      }),
    ]);
    await expect(
      dataSource.query('UPDATE circle_admin_events SET reason = $2 WHERE circle_id = $1', [
        id,
        'x',
      ]),
    ).rejects.toThrow();

    // Sigue el ciclo con el calendario nuevo: cobra y paga diciembre.
    await job([id])('2026-12-05');
    const [payout] = await dataSource.query<{ period: string }[]>(
      "SELECT to_char(period, 'YYYY-MM') AS period FROM circle_payouts WHERE circle_id = $1",
      [id],
    );
    expect(payout).toEqual({ period: '2026-12' });
  });

  it('descuenta del payout la cuota del mes de cobro si el miembro lo pidió (COPAYNI-38)', async () => {
    const { id, members } = await fullCircle(Period.of(2026, 11));
    const settings = new TypeOrmPaymentSettings(dataSource.getRepository(CircleEntity));
    const [, second] = members;
    await expect(settings.get(second!.userId)).resolves.toEqual({ deductPayInFromPayout: false });
    await settings.save(second!.userId, { deductPayInFromPayout: true });
    await settings.save(second!.userId, { deductPayInFromPayout: true });
    await expect(settings.get(second!.userId)).resolves.toEqual({ deductPayInFromPayout: true });
    await expect(settings.get('no-es-uuid')).resolves.toEqual({ deductPayInFromPayout: false });

    const runOn = job([id]);
    await runOn('2026-11-05');
    await runOn('2026-12-05');
    const [installment] = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM circle_installments
        WHERE circle_id = $1 AND user_id = $2 AND period = '2026-12-01'`,
      [id, second!.userId],
    );
    expect(installment?.status).toBe('deducted');
    const [payout] = await dataSource.query<{ amount: string }[]>(
      "SELECT amount::text AS amount FROM circle_payouts WHERE circle_id = $1 AND period = '2026-12-01'",
      [id],
    );
    expect(payout?.amount).toBe(
      String(second!.price.netPayout.subtract(second!.price.installments[1]!).amount),
    );
    const [deduction] = await dataSource.query<{ total: number }[]>(
      `SELECT count(*)::int AS total FROM ledger_transactions
        WHERE circle_id = $1 AND kind = 'payin_deducted'`,
      [id],
    );
    expect(deduction?.total).toBe(1);
  });

  it('el historial lista pagos y cobros paginados, del más reciente al más antiguo (COPAYNI-41)', async () => {
    const { id, members } = await fullCircle(Period.of(2026, 11));
    const payments = new TypeOrmPaymentsQuery(dataSource.getRepository(CircleEntity));
    const runOn = job([id]);
    for (const date of ['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05', '2027-03-05']) {
      await runOn(date);
    }
    await runOn('2027-04-05');
    const [second] = members.slice(1);
    const page = (cursor: string | null, type: 'payment' | 'payout' = 'payment') =>
      payments.transactionsOf({ userId: second!.userId, type, limit: 4, cursor });

    const first = await page(null);
    expect(first.items).toHaveLength(4);
    expect(
      first.items.every(({ kind, circleId }) => kind === 'installment' && circleId === id),
    ).toBe(true);
    const next = await page(first.nextCursor);
    expect(next).toMatchObject({ nextCursor: null });
    const all = [...first.items, ...next.items];
    expect(all.map(({ period }) => period?.toString()).sort()).toEqual([
      '2026-11',
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
      '2027-04',
    ]);
    expect(new Set(all.map(({ id: itemId }) => itemId)).size).toBe(6);
    const times = all.map(({ occurredAt }) => occurredAt.getTime());
    expect([...times].sort((a, b) => b - a)).toEqual(times);

    const payouts = await page(null, 'payout');
    expect(payouts.items).toEqual([
      expect.objectContaining({
        type: 'payout',
        kind: 'payout',
        period: Period.of(2026, 12),
        amount: second!.price.netPayout,
      }),
    ]);
    await expect(page('no-es-un-cursor')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      payments.transactionsOf({ userId: 'no-es-uuid', type: 'payment', limit: 4, cursor: null }),
    ).resolves.toEqual({ items: [], nextCursor: null });
  });

  it('el resumen de pagos lista las cuotas por pagar hasta que se cobran (COPAYNI-35)', async () => {
    const { id, members } = await fullCircle(Period.of(2026, 11));
    const payments = new TypeOrmPaymentsQuery(dataSource.getRepository(CircleEntity));
    const [first] = members;
    await expect(payments.dueInstallmentsOf(first!.userId)).resolves.toEqual([]);

    // El 2 de noviembre empieza: la cuota de noviembre queda pendiente hasta el día 5.
    await job([id])('2026-11-02');
    await expect(payments.dueInstallmentsOf(first!.userId)).resolves.toEqual([
      {
        installmentId: expect.any(String),
        circleId: id,
        period: Period.of(2026, 11),
        dueOn: LocalDate.parse('2026-11-05'),
        amount: first!.price.installments[0],
        status: 'pending',
      },
    ]);
    await job([id])('2026-11-05');
    // Noviembre se cobró y diciembre todavía no tiene cuota: no debe nada.
    const [due] = await payments.dueInstallmentsOf(first!.userId);
    expect(due?.period).toEqual(Period.of(2026, 12));
    await expect(payments.dueInstallmentsOf('no-es-uuid')).resolves.toEqual([]);
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
      return CircleCycle.restore({
        ...stored,
        dueDay: 5,
        delinquency: TEST_DELINQUENCY,
        fund: { balance: stored.fundBalance, feeShareBps: TEST_FUND_SHARE_BPS },
        members: [],
      });
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
        const cycle = CircleCycle.restore({
          ...stored,
          dueDay: 5,
          delinquency: TEST_DELINQUENCY,
          fund: { balance: stored.fundBalance, feeShareBps: TEST_FUND_SHARE_BPS },
          members: stored.members.map(({ userId, position }) => ({
            userId,
            position,
            quote: TEST_PRICING.quote(stored.terms, position),
          })),
        });
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
