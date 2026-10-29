import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { LedgerTransaction } from '@src/modules/circles/domain/value-objects/ledger-transaction';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { CircleMembershipEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle.entity';
import { TypeOrmCircleCycleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle-cycle.repository';
import { TypeOrmCircleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle.repository';
import { TypeOrmGuaranteeFund } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-guarantee-fund.repository';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING,
} from '@test/support/join-circle.fixture';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

const at = (date: string) => new Date(`${date}T17:00:00Z`);
const pen = (amount: number) => Money.of(amount, 'PEN');

/**
 * Registro contable del fondo contra PostgreSQL (COPAYNI-58). El fondo es uno solo y otros
 * archivos también lo mueven, así que se compara lo que cambió, no el saldo absoluto.
 */
describe('TypeOrmGuaranteeFund', () => {
  let dataSource: DataSource;
  let fund: TypeOrmGuaranteeFund;
  let circles: TypeOrmCircleRepository;
  let cycles: TypeOrmCircleCycleRepository;

  beforeAll(async () => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    dataSource = await openTestDatabase([CircleEntity, CircleMembershipEntity]);
    fund = new TypeOrmGuaranteeFund(dataSource.getRepository(CircleEntity));
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

  const seed = (amount: Money, operationId = randomUUID()) =>
    LedgerTransaction.transfer({
      key: `seed_capital:${operationId}`,
      kind: 'seed_capital',
      from: { account: 'external' },
      to: { account: 'guarantee_fund' },
      amount,
      reason: 'Capital semilla de prueba',
    })!;

  const entriesOf = (key: string) =>
    dataSource.query<{ account: string; amount: string }[]>(
      'SELECT account, amount::text AS amount FROM ledger_entries WHERE transaction_key = $1 ORDER BY account',
      [key],
    );

  it('guarda un movimiento una sola vez por clave', async () => {
    const transaction = seed(pen(1_000));
    await expect(fund.record(transaction)).resolves.toBe(true);
    await expect(fund.record(transaction)).resolves.toBe(false);
    expect(await entriesOf(transaction.key)).toEqual([
      { account: 'external', amount: '-1000' },
      { account: 'guarantee_fund', amount: '1000' },
    ]);
    const [reason] = await dataSource.query<{ reason: string }[]>(
      'SELECT reason FROM ledger_transactions WHERE key = $1',
      [transaction.key],
    );
    expect(reason?.reason).toBe('Capital semilla de prueba');
  });

  it('el registro es solo de inserción: no se edita, no se borra, no se vacía', async () => {
    const transaction = seed(pen(1));
    await fund.record(transaction);
    for (const sql of [
      `UPDATE ledger_entries SET amount = 2 WHERE transaction_key = '${transaction.key}'`,
      `DELETE FROM ledger_entries WHERE transaction_key = '${transaction.key}'`,
      `UPDATE ledger_transactions SET reason = 'otro' WHERE key = '${transaction.key}'`,
      `DELETE FROM ledger_transactions WHERE key = '${transaction.key}'`,
      'TRUNCATE ledger_entries',
    ]) {
      await expect(dataSource.query(sql)).rejects.toThrow(/solo de inserción/);
    }
  });

  it('la base rechaza un movimiento que no cuadra o sin asientos', async () => {
    const insert = (entries: [string, number][]) =>
      dataSource.transaction(async (manager) => {
        const key = `adjustment:${randomUUID()}`;
        await manager.query(
          "INSERT INTO ledger_transactions (key, kind, reason) VALUES ($1, 'adjustment', 'x')",
          [key],
        );
        for (const [account, amount] of entries) {
          await manager.query(
            "INSERT INTO ledger_entries (transaction_key, account, amount, currency) VALUES ($1, $2, $3, 'PEN')",
            [key, account, amount],
          );
        }
      });
    await expect(
      insert([
        ['external', -1],
        ['guarantee_fund', 2],
      ]),
    ).rejects.toThrow(/no cuadra/);
    await expect(insert([])).rejects.toThrow(/no cuadra/);
    await expect(insert([['guarantee_fund', 1]])).rejects.toThrow(/no cuadra/);
  });

  it('informa el saldo por moneda y los círculos en curso', async () => {
    const before = (await fund.status()).find(({ balance }) => balance.currency === 'PEN');
    await fund.record(seed(pen(5_000)));
    const after = (await fund.status()).find(({ balance }) => balance.currency === 'PEN')!;
    expect(after.balance.amount - (before?.balance.amount ?? 0)).toBeGreaterThanOrEqual(5_000);
    expect(after.activeCircles).toBeGreaterThanOrEqual(0);
  });

  it('el ciclo guarda sus movimientos: cada mes el pozo cierra en cero y la devolución se paga al terminar', async () => {
    const id = randomUUID();
    const terms = CircleTerms.create({
      payout: pen(600_000),
      months: 6,
      startsOn: Period.of(2026, 11),
    });
    const members = [];
    for (let position = 1; position <= 6; position += 1) {
      members.push({
        userId: await insertTestUser(dataSource),
        position,
        idempotencyKey: `k-${id}-${position}`,
        price: priceOf(TEST_PRICING.quote(terms, position)),
      });
    }
    await circles.create(Circle.restore({ id, terms, memberships: members }));
    // Liquidez suficiente para cubrir la cuota del expulsado en todos los meses.
    await fund.record(seed(pen(10_000_000)));

    const defaulter = members[4]!;
    const clock = new TestClock();
    const payments = new FakeCyclePayments();
    const refunds = jest.spyOn(payments, 'refund');
    const useCase = new AdvanceCircleCyclesUseCase(
      { listToAdvance: () => Promise.resolve([id]), withLock: cycles.withLock.bind(cycles) },
      TEST_PRICING,
      {
        dueDay: 5,
        timeZone: 'America/Lima',
        delinquency: TEST_DELINQUENCY,
        fundFeeShareBps: TEST_FUND_SHARE_BPS,
      },
      {
        // El turno 5 paga los dos primeros meses y deja de pagar en el tercero.
        collect: (installment) =>
          Promise.resolve(
            installment.userId === defaulter.userId &&
              !Period.of(2027, 1).isAfter(installment.period)
              ? 'failed'
              : 'paid',
          ),
      },
      payments,
      clock,
    );
    const runOn = (date: string) => {
      clock.set(at(date));
      return useCase.execute();
    };
    for (const date of [
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
      '2027-01-09',
      '2027-02-05',
      '2027-03-05',
      '2027-03-05',
      '2027-04-05',
    ]) {
      await runOn(date);
    }

    const [circle] = await dataSource.query<{ state: string }[]>(
      'SELECT cycle_state AS state FROM circles WHERE id = $1',
      [id],
    );
    expect(circle?.state).toBe('finished');
    const pots = await dataSource.query<{ period: string; balance: string }[]>(
      `SELECT to_char(t.period, 'YYYY-MM') AS period, sum(e.amount)::text AS balance
         FROM ledger_entries e JOIN ledger_transactions t ON t.key = e.transaction_key
        WHERE t.circle_id = $1 AND e.account = 'circle_pot'
        GROUP BY t.period ORDER BY t.period`,
      [id],
    );
    expect(pots).toHaveLength(6);
    expect(pots.every(({ balance }) => balance === '0')).toBe(true);

    const kinds = await dataSource.query<{ kind: string; total: number }[]>(
      `SELECT kind, count(*)::int AS total FROM ledger_transactions
        WHERE circle_id = $1 GROUP BY kind ORDER BY kind`,
      [id],
    );
    expect(Object.fromEntries(kinds.map(({ kind, total }) => [kind, total]))).toMatchObject({
      collection: 6,
      coverage: 4,
      payout: 5,
      pot_returned: 1,
      refund_due: 1,
      penalty: 1,
      refund_paid: 1,
    });

    const paid = defaulter.price.installments
      .slice(0, 2)
      .reduce((sum, amount) => sum.add(amount), pen(0));
    const refund = paid.subtract(paid.percentage(500));
    expect(await entriesOf(`refund_paid:${id}:${defaulter.userId}`)).toEqual([
      { account: 'external', amount: String(refund.amount) },
      { account: 'refunds_payable', amount: String(-refund.amount) },
    ]);
    expect(refunds).toHaveBeenCalledTimes(1);
    expect(refunds).toHaveBeenCalledWith({
      circleId: id,
      userId: defaulter.userId,
      amount: refund,
    });
    const [expulsion] = await dataSource.query<{ paid: string; refunded: boolean }[]>(
      `SELECT paid_amount::text AS paid, refunded_at IS NOT NULL AS refunded
         FROM circle_expulsions WHERE circle_id = $1`,
      [id],
    );
    expect(expulsion).toEqual({ paid: String(paid.amount), refunded: true });
  });
});
