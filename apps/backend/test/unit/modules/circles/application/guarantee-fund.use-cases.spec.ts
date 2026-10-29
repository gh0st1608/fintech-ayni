import { Logger } from '@nestjs/common';

import {
  type FundMetricsPort,
  type FundStatus,
  type GuaranteeFundPort,
} from '@src/modules/circles/application/ports/guarantee-fund.port';
import { CheckGuaranteeFundUseCase } from '@src/modules/circles/application/use-cases/check-guarantee-fund.use-case';
import { RecordFundMovementUseCase } from '@src/modules/circles/application/use-cases/record-fund-movement.use-case';
import { type LedgerTransaction } from '@src/modules/circles/domain/value-objects/ledger-transaction';
import { OtelFundMetrics } from '@src/modules/circles/infrastructure/observability/otel-fund-metrics';
import { Money } from '@src/shared/domain/value-objects/money';
import { SEED_CAPITAL_SCENARIOS } from '@test/support/join-circle.fixture';

const pen = (amount: number) => Money.of(amount, 'PEN');

class FakeFund implements GuaranteeFundPort {
  readonly recorded = new Map<string, LedgerTransaction>();

  constructor(private readonly statuses: FundStatus[] = []) {}

  status(): Promise<FundStatus[]> {
    return Promise.resolve(this.statuses);
  }

  record(transaction: LedgerTransaction): Promise<boolean> {
    if (this.recorded.has(transaction.key)) return Promise.resolve(false);
    this.recorded.set(transaction.key, transaction);
    return Promise.resolve(true);
  }
}

describe('CheckGuaranteeFundUseCase', () => {
  afterEach(() => jest.restoreAllMocks());

  it('alerta cuando el saldo no cubre 2 cuotas base por círculo en curso', async () => {
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const reports: Parameters<FundMetricsPort['report']>[0][] = [];
    const useCase = new CheckGuaranteeFundUseCase(
      new FakeFund([
        // 3 círculos con cuotas base que suman 9.000: el mínimo es 18.000.
        { balance: pen(1_799_999), activeCircles: 3, activeBaseInstallments: pen(900_000) },
        {
          balance: Money.of(500, 'USD'),
          activeCircles: 0,
          activeBaseInstallments: Money.of(0, 'USD'),
        },
      ]),
      { report: (status) => reports.push(status) },
      { minInstallmentsPerCircle: 2 },
    );

    const result = await useCase.execute();
    expect(result.map(({ belowMinimum }) => belowMinimum)).toEqual([true, false]);
    expect(reports[0]).toMatchObject({ minimum: pen(1_800_000), belowMinimum: true });
    expect(warn).toHaveBeenCalledWith({
      event: 'guarantee_fund.below_minimum',
      currency: 'PEN',
      balance: 1_799_999,
      minimum: 1_800_000,
      activeCircles: 3,
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'guarantee_fund.status', currency: 'USD' }),
    );
  });

  it.each(SEED_CAPITAL_SCENARIOS)(
    'el capital semilla $name es el saldo mínimo de sus $circles círculos de referencia',
    async ({ circles, seed }) => {
      jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      // Círculos de 30.000 en 10 meses: cuota base de 3.000 cada uno.
      const statusWith = (active: number): FundStatus => ({
        balance: seed,
        activeCircles: active,
        activeBaseInstallments: pen(300_000 * active),
      });
      const check = (active: number) =>
        new CheckGuaranteeFundUseCase(
          new FakeFund([statusWith(active)]),
          { report: () => undefined },
          { minInstallmentsPerCircle: 2 },
        ).execute();

      expect((await check(circles))[0]?.belowMinimum).toBe(false);
      expect((await check(circles + 1))[0]?.belowMinimum).toBe(true);
    },
  );
});

describe('RecordFundMovementUseCase', () => {
  afterEach(() => jest.restoreAllMocks());

  it('registra el capital semilla y una corrección con motivo, una vez por operación', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const fund = new FakeFund();
    const useCase = new RecordFundMovementUseCase(fund);
    const seed = {
      kind: 'seed_capital' as const,
      amount: pen(1_000_000),
      reason: 'Capital semilla aprobado por el PO',
      operationId: 'op-1',
    };

    await expect(useCase.execute(seed)).resolves.toBe(true);
    await expect(useCase.execute(seed)).resolves.toBe(false);
    await expect(
      useCase.execute({
        kind: 'adjustment',
        amount: pen(-200),
        reason: 'Corrige un aporte duplicado',
        operationId: 'op-2',
      }),
    ).resolves.toBe(true);

    expect(fund.recorded.get('seed_capital:op-1')?.netFor('guarantee_fund')).toEqual(
      pen(1_000_000),
    );
    expect(fund.recorded.get('adjustment:op-2')?.netFor('guarantee_fund')).toEqual(pen(-200));
    expect(log).toHaveBeenCalledTimes(2);
  });

  it('rechaza un capital semilla que no es positivo, un monto cero o un motivo vacío', async () => {
    const useCase = new RecordFundMovementUseCase(new FakeFund());
    const base = { reason: 'motivo', operationId: 'op' };
    await expect(
      useCase.execute({ ...base, kind: 'seed_capital', amount: pen(-1) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      useCase.execute({ ...base, kind: 'adjustment', amount: pen(0) }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      useCase.execute({ ...base, kind: 'adjustment', amount: pen(1), reason: ' ' }),
    ).rejects.toMatchObject({ code: 'INVALID_LEDGER_TRANSACTION' });
  });
});

describe('OtelFundMetrics', () => {
  it('registra saldo y mínimo sin telemetría configurada', () => {
    const metrics = new OtelFundMetrics();
    expect(() =>
      metrics.report({
        balance: pen(1),
        activeCircles: 1,
        activeBaseInstallments: pen(1),
        minimum: pen(2),
        belowMinimum: true,
      }),
    ).not.toThrow();
  });
});
