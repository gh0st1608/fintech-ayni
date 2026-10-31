import { Money } from '@/domain/shared/value-objects/Money';

import { assertReferralSummary, InvalidReferralSummaryError } from './Referral';
import { InvalidReferralCodeError, parseReferralCode } from './ReferralCode';

describe('parseReferralCode', () => {
  it('ignora mayúsculas y espacios, como el backend', () => {
    expect(parseReferralCode(' k7m2 q9xa ')).toBe('K7M2Q9XA');
  });

  it.each(['K7M2Q9X', 'K7M2Q9XAB', 'K7M2Q9X0', 'K7M2Q9XO', 'K7M2Q9XI', 'K7M2Q9XL', 'K7M2Q9X1', ''])(
    'rechaza %p',
    (raw) => {
      expect(() => parseReferralCode(raw)).toThrow(InvalidReferralCodeError);
    },
  );
});

describe('assertReferralSummary', () => {
  const pen = (amount: number) => Money.of(amount, 'PEN');

  it('acepta saldo = ganado − canjeado', () => {
    const summary = { earned: pen(30000), redeemed: pen(10000), balance: pen(20000) };
    expect(assertReferralSummary(summary)).toBe(summary);
  });

  it.each([
    ['un saldo que no cuadra', { earned: pen(30000), redeemed: pen(10000), balance: pen(30000) }],
    [
      'monedas distintas',
      { earned: pen(30000), redeemed: Money.of(10000, 'USD'), balance: pen(20000) },
    ],
  ])('rechaza %s', (_case, summary) => {
    expect(() => assertReferralSummary(summary)).toThrow(InvalidReferralSummaryError);
  });
});
