import {
  assertCanJoin,
  type JoinApplicant,
} from '@src/modules/circles/domain/services/join-eligibility';
import { Money } from '@src/shared/domain/value-objects/money';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const ELIGIBLE: JoinApplicant = {
  identityVerified: true,
  monthlyPayInLimit: null,
  incomeDeclared: true,
  payoutMethod: { type: 'bank_transfer', limit: null },
};
const PAYOUT = pen(30_000);
const INSTALLMENTS = [pen(3_400), pen(3_000), pen(2_900)];

const check = (applicant: Partial<JoinApplicant>) => () =>
  assertCanJoin({ ...ELIGIBLE, ...applicant }, PAYOUT, INSTALLMENTS);

describe('assertCanJoin', () => {
  it('acepta a un usuario verificado, dentro del límite y con método de cobro', () => {
    expect(check({})).not.toThrow();
    expect(check({ monthlyPayInLimit: pen(3_400) })).not.toThrow();
    expect(check({ payoutMethod: { type: 'prepaid_card', limit: pen(30_000) } })).not.toThrow();
  });

  it('exige el National ID antes que todo lo demás', () => {
    expect(check({ identityVerified: false, payoutMethod: null })).toThrow(
      expect.objectContaining({ code: 'NATIONAL_ID_REQUIRED', kind: 'domain' }),
    );
  });

  it('rechaza si alguna cuota del slot supera el límite mensual', () => {
    expect(check({ monthlyPayInLimit: pen(3_399), payoutMethod: null })).toThrow(
      expect.objectContaining({ code: 'MONTHLY_LIMIT_EXCEEDED' }),
    );
  });

  it('exige un método de cobro', () => {
    expect(check({ payoutMethod: null })).toThrow(
      expect.objectContaining({ code: 'PAYOUT_METHOD_REQUIRED' }),
    );
  });

  it('rechaza un payout mayor que el límite del método', () => {
    expect(check({ payoutMethod: { type: 'prepaid_card', limit: pen(29_999) } })).toThrow(
      expect.objectContaining({ code: 'PAYOUT_METHOD_LIMIT_EXCEEDED' }),
    );
  });
});
