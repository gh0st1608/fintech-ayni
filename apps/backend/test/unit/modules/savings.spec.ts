import { QuoteSavingPlanUseCase } from '@src/modules/savings/application/saving.use-cases';
import {
  parseCashback,
  parsePlans,
  SavingCatalog,
} from '@src/modules/savings/domain/saving-catalog';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const CATALOG = SavingCatalog.create({
  plans: parsePlans('gold:3000000,lite:300000,diamond:10000000', 'PEN'),
  cashbackBps: parseCashback('24:2000,6:500,12:1000'),
});

describe('Catálogo de ahorro (COPAYNI-32 y 33)', () => {
  it('lista los planes del menor al mayor con su cashback máximo', () => {
    expect(CATALOG.plans()).toEqual([
      { id: 'lite', target: pen(3_000), maxCashback: pen(600) },
      { id: 'gold', target: pen(30_000), maxCashback: pen(6_000) },
      { id: 'diamond', target: pen(100_000), maxCashback: pen(20_000) },
    ]);
    expect(CATALOG.durations).toEqual([6, 12, 24]);
  });

  it('cotiza cuotas, cashback, total y fechas: el payout es el mes siguiente a la última cuota', () => {
    const quote = CATALOG.quote('lite', 6, Period.of(2026, 12));
    expect(quote).toMatchObject({
      cashback: pen(150),
      total: pen(3_150),
      startsOn: Period.of(2026, 12),
      payoutPeriod: Period.of(2027, 6),
    });
    expect(quote.installments).toEqual(Array.from({ length: 6 }, () => pen(500)));
    // 100.000 en 24 cuotas no es exacto: las primeras llevan un céntimo más y suman el total.
    const uneven = CATALOG.quote('diamond', 24, Period.of(2026, 12));
    expect(uneven.installments[0]).toEqual(Money.of(416_667, 'PEN'));
    expect(uneven.installments.reduce((sum, value) => sum.add(value))).toEqual(pen(100_000));
  });

  it('rechaza un plan inexistente, una duración no ofrecida y catálogos inválidos', () => {
    expect(() => CATALOG.quote('otro', 6, Period.of(2026, 12))).toThrow(
      expect.objectContaining({ code: 'SAVING_PLAN_NOT_FOUND' }),
    );
    expect(() => CATALOG.quote('lite', 9, Period.of(2026, 12))).toThrow(
      expect.objectContaining({ code: 'VALIDATION_ERROR' }),
    );
    const invalid = [
      { plans: [], cashbackBps: parseCashback('6:500') },
      { plans: parsePlans('a:1,a:2', 'PEN'), cashbackBps: parseCashback('6:500') },
      { plans: parsePlans('a:0', 'PEN'), cashbackBps: parseCashback('6:500') },
      { plans: parsePlans('a:1', 'PEN'), cashbackBps: parseCashback('6:10001') },
    ];
    for (const props of invalid) {
      expect(() => SavingCatalog.create(props)).toThrow(
        expect.objectContaining({ code: 'INVALID_SAVING_CATALOG' }),
      );
    }
  });

  it('el plan empieza el mes siguiente al actual, en la zona horaria del negocio', () => {
    // 1 de diciembre a las 03:00 UTC: en Lima todavía es 30 de noviembre.
    const useCase = new QuoteSavingPlanUseCase(
      CATALOG,
      { timeZone: 'America/Lima', startOffsetMonths: 1 },
      new TestClock(new Date('2026-12-01T03:00:00Z')),
    );
    expect(useCase.execute('lite', 12).startsOn).toEqual(Period.of(2026, 12));
  });
});
