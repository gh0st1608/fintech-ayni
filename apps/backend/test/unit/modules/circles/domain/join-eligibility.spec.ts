import {
  applicantIn,
  assertCanJoin,
  type JoinApplicant,
} from '@src/modules/circles/domain/services/join-eligibility';
import { ExchangeRates } from '@src/shared/domain/value-objects/exchange-rates';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const ELIGIBLE: JoinApplicant = {
  identityVerified: true,
  monthlyPayInLimit: null,
  incomeDeclared: true,
  payoutMethod: { type: 'bank_account', limit: null },
};
const PAYOUT = pen(30_000);
/**
 * Las mismas tres cuotas de siempre, una por mes, que es lo que produce una junta mensual: con
 * un mes por cuota, comparar la suma del mes y comparar cada cuota dan lo mismo, y por eso este
 * archivo es también la reja de regresión del caso mensual (COPAYNI-110).
 */
const PAY_IN = [pen(3_400), pen(3_000), pen(2_900)].map((amount, index) => ({
  period: Period.of(2026, 11).addMonths(index),
  amount,
}));

const check = (applicant: Partial<JoinApplicant>) => () =>
  assertCanJoin({ ...ELIGIBLE, ...applicant }, PAYOUT, PAY_IN);

describe('assertCanJoin', () => {
  it('acepta a un usuario verificado, dentro del límite y con método de cobro', () => {
    expect(check({})).not.toThrow();
    expect(check({ monthlyPayInLimit: pen(3_400) })).not.toThrow();
    expect(check({ payoutMethod: { type: 'wallet', limit: pen(30_000) } })).not.toThrow();
  });

  it('exige el National ID antes que todo lo demás', () => {
    expect(check({ identityVerified: false, payoutMethod: null })).toThrow(
      expect.objectContaining({ code: 'NATIONAL_ID_REQUIRED', kind: 'domain' }),
    );
  });

  it('rechaza si lo que paga en un mes supera el límite mensual', () => {
    expect(check({ monthlyPayInLimit: pen(3_399), payoutMethod: null })).toThrow(
      expect.objectContaining({ code: 'MONTHLY_LIMIT_EXCEEDED' }),
    );
  });

  it('el rechazo dice qué mes y cuánto se pasa, para saber qué ajustar', () => {
    expect(check({ monthlyPayInLimit: pen(3_000) })).toThrow(
      expect.objectContaining({
        code: 'MONTHLY_LIMIT_EXCEEDED',
        message: expect.stringContaining('2026-11'),
        details: { month: '2026-11', total: '340000', excess: '40000', currency: 'PEN' },
      }),
    );
  });

  it('suma las cuotas que caen en el mismo mes, que es lo que el límite mide', () => {
    // Cuatro cuotas semanales de la mitad del límite en un mes: cada una pasa el filtro por
    // separado y juntas son el doble de lo declarado. Antes se aceptaba.
    const weekly = [{ period: Period.of(2026, 11), amount: pen(2_000) }];
    const same = (amount: Money) => ({ period: Period.of(2026, 11), amount });
    expect(() =>
      assertCanJoin({ ...ELIGIBLE, monthlyPayInLimit: pen(1_000) }, PAYOUT, weekly),
    ).toThrow(expect.objectContaining({ code: 'MONTHLY_LIMIT_EXCEEDED' }));
    expect(() =>
      assertCanJoin({ ...ELIGIBLE, monthlyPayInLimit: pen(2_000) }, PAYOUT, [same(pen(2_000))]),
    ).not.toThrow();
  });

  it('exige un método de cobro', () => {
    expect(check({ payoutMethod: null })).toThrow(
      expect.objectContaining({ code: 'PAYOUT_METHOD_REQUIRED' }),
    );
  });

  it('rechaza un payout mayor que el límite del método', () => {
    expect(check({ payoutMethod: { type: 'wallet', limit: pen(29_999) } })).toThrow(
      expect.objectContaining({ code: 'PAYOUT_METHOD_LIMIT_EXCEEDED' }),
    );
  });
});

describe('applicantIn (pending-scope M2)', () => {
  const rates = ExchangeRates.parse('PEN', ['USD:3.75']);

  it("convierte los límites a la moneda del Game'ya, hacia abajo", () => {
    const converted = applicantIn(
      {
        ...ELIGIBLE,
        monthlyPayInLimit: pen(1),
        payoutMethod: { type: 'wallet', limit: pen(30_000) },
      },
      'USD',
      rates,
    );
    // S/ 1,00 = USD 0,2666… → USD 0,26.
    expect(converted.monthlyPayInLimit).toEqual(Money.of(26, 'USD'));
    expect(converted.payoutMethod).toEqual({
      type: 'wallet',
      limit: Money.of(8_000_00, 'USD'),
    });
  });

  it('deja igual a quien no tiene límites', () => {
    expect(applicantIn(ELIGIBLE, 'USD', rates)).toEqual(ELIGIBLE);
    expect(applicantIn({ ...ELIGIBLE, payoutMethod: null }, 'USD', rates).payoutMethod).toBeNull();
  });
});
