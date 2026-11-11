import {
  type InstallmentRecord,
  paymentStreak,
} from '@src/modules/circles/domain/services/payment-streak';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Period } from '@src/shared/domain/value-objects/period';

const GRACE_DAYS = 3;
const day = (value: string) => LocalDate.parse(value);

/** Una cuota que vence el día 5 de `period`, pagada el día `paidDay` (o sin pagar). */
function installment(
  period: string,
  status: string,
  paidDay: number | null = null,
): InstallmentRecord {
  return {
    period: Period.parse(period),
    dueOn: day(`${period}-05`),
    status,
    paidOn: paidDay === null ? null : day(`${period}-${String(paidDay).padStart(2, '0')}`),
  };
}

const streakOn = (today: string, installments: InstallmentRecord[]) =>
  paymentStreak(installments, day(today), GRACE_DAYS);
const summary = (today: string, installments: InstallmentRecord[]) => {
  const streak = streakOn(today, installments);
  return {
    months: streak.months,
    last: streak.lastMonths.map(({ period, status }) => `${period.toString()}:${status}`),
  };
};

describe('Racha de pagos a tiempo (COPAYNI-82)', () => {
  it('cuenta los meses seguidos pagados hasta el fin de la gracia', () => {
    expect(
      summary('2026-12-20', [
        installment('2026-09', 'paid', 5),
        installment('2026-10', 'paid', 2),
        installment('2026-11', 'paid', 8),
        installment('2026-12', 'paid', 5),
      ]),
    ).toEqual({
      months: 4,
      last: ['2026-09:on_time', '2026-10:on_time', '2026-11:on_time', '2026-12:on_time'],
    });
  });

  it('pagar dentro de la gracia no la rompe; pagar después de la gracia, sí', () => {
    // Noviembre se pagó el 9: un día después del fin de la gracia (8).
    expect(
      summary('2026-12-20', [
        installment('2026-10', 'paid', 5),
        installment('2026-11', 'paid', 9),
        installment('2026-12', 'paid', 7),
      ]),
    ).toMatchObject({ months: 1, last: ['2026-10:on_time', '2026-11:late', '2026-12:on_time'] });
  });

  it('la mora la rompe y una cuota todavía pagable no cuenta ni la rompe', () => {
    expect(
      summary('2027-01-06', [
        installment('2026-10', 'paid', 5),
        installment('2026-11', 'paid', 5),
        installment('2026-12', 'paid', 5),
        // Enero vence el 5 y está en gracia hasta el 8: todavía puede pagarse a tiempo.
        installment('2027-01', 'overdue'),
      ]),
    ).toMatchObject({ months: 3, last: expect.arrayContaining(['2027-01:pending']) });
    expect(
      summary('2027-01-09', [installment('2026-12', 'paid', 5), installment('2027-01', 'overdue')]),
    ).toMatchObject({ months: 0 });
    expect(
      summary('2027-02-20', [
        installment('2026-12', 'paid', 5),
        installment('2027-01', 'defaulted'),
      ]),
    ).toMatchObject({ months: 0 });
  });

  it('las cuotas que paga la retención o la deducción del payout cuentan como a tiempo', () => {
    expect(
      summary('2027-03-20', [
        installment('2027-01', 'deducted'),
        installment('2027-02', 'retained'),
        installment('2027-03', 'paid', 4),
      ]).months,
    ).toBe(3);
  });

  it('con varios círculos, un mes cuenta solo si todas sus cuotas se pagaron a tiempo', () => {
    expect(
      summary('2026-12-20', [
        installment('2026-11', 'paid', 5),
        installment('2026-12', 'paid', 5),
        installment('2026-12', 'paid', 15),
      ]),
    ).toMatchObject({ months: 0, last: ['2026-11:on_time', '2026-12:late'] });
  });

  it('sin cuotas no hay racha', () => {
    expect(streakOn('2026-12-20', [])).toEqual({ months: 0, lastMonths: [] });
  });
});
