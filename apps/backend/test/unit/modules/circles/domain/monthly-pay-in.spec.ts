import {
  monthOverLimit,
  payInByMonth,
  totalPayInByMonth,
} from '@src/modules/circles/domain/services/monthly-pay-in';
import { TurnSchedule } from '@src/modules/circles/domain/services/turn-schedule';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { type Period } from '@src/shared/domain/value-objects/period';

/** Cuánto cae en cada mes calendario, que es la unidad en que está declarado el límite. */
const pen = (major: number) => Money.of(major * 100, 'PEN');
const months = (payIn: readonly { period: Period; amount: Money }[]) =>
  payIn.map(({ period, amount }) => [period.toString(), amount.amount / 100]);

const schedule = (cadence: Cadence, startsOn: string, turns: number, dueDay = 5) =>
  TurnSchedule.forCollection({
    startsOn: LocalDate.parse(startsOn),
    cadence,
    turns,
    dueDay,
  });

describe('Pay-in por mes calendario (COPAYNI-110)', () => {
  it('en cadencia mensual hay una cuota por mes, como siempre', () => {
    const payIn = payInByMonth(
      [pen(3_000), pen(3_000), pen(3_000)],
      schedule(Cadence.monthly, '2026-11-01', 3),
    );

    expect(months(payIn)).toEqual([
      ['2026-11', 3_000],
      ['2026-12', 3_000],
      ['2027-01', 3_000],
    ]);
  });

  it('en cadencia semanal suma las cuatro o cinco cuotas que caen en el mes', () => {
    // Arranca el 4 de noviembre: noviembre se lleva los días 4, 11, 18 y 25.
    const payIn = payInByMonth(
      Array.from({ length: 6 }, () => pen(1_000)),
      schedule(Cadence.weekly, '2026-11-04', 6),
    );

    expect(months(payIn)).toEqual([
      ['2026-11', 4_000],
      ['2026-12', 2_000],
    ]);
  });

  it('cada mes se evalúa por separado: pasarse en uno no depende de los demás', () => {
    const payIn = payInByMonth(
      [pen(1_000), pen(9_000), pen(1_000)],
      schedule(Cadence.monthly, '2026-11-01', 3),
    );

    expect(monthOverLimit(payIn, pen(5_000))?.period.toString()).toBe('2026-12');
    expect(monthOverLimit(payIn, pen(9_000))).toBeNull();
  });

  it('nombra el primer mes que se pasa, que es el que la persona tiene encima', () => {
    const payIn = payInByMonth(
      [pen(9_000), pen(9_000)],
      schedule(Cadence.monthly, '2026-11-01', 2),
    );
    const over = monthOverLimit(payIn, pen(5_000));

    expect(over?.period.toString()).toBe('2026-11');
    expect(over?.total).toEqual(pen(9_000));
    expect(over?.excess).toEqual(pen(4_000));
  });

  it('una cuota de cero no es un compromiso: quien toma una vacante no paga lo anterior', () => {
    const payIn = payInByMonth(
      [Money.zero('PEN'), Money.zero('PEN'), pen(3_000)],
      schedule(Cadence.monthly, '2026-11-01', 3),
    );

    expect(months(payIn)).toEqual([['2027-01', 3_000]]);
  });

  it('suma varios círculos mes a mes: el límite es de la persona, no del círculo', () => {
    const mensual = payInByMonth(
      [pen(3_000), pen(3_000)],
      schedule(Cadence.monthly, '2026-11-01', 2),
    );
    const semanal = payInByMonth([pen(500), pen(500)], schedule(Cadence.weekly, '2026-12-02', 2));

    expect(months(totalPayInByMonth([mensual, semanal]))).toEqual([
      ['2026-11', 3_000],
      ['2026-12', 4_000],
    ]);
  });

  it('sin cuotas no hay nada que comparar', () => {
    expect(payInByMonth([], schedule(Cadence.monthly, '2026-11-01', 3))).toEqual([]);
    expect(totalPayInByMonth([])).toEqual([]);
    expect(monthOverLimit([], pen(1))).toBeNull();
  });
});
