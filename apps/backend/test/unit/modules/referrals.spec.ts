import { ReferralCode } from '@src/modules/referrals/domain/referral-code';

describe('ReferralCode (COPAYNI-51)', () => {
  it('genera 8 caracteres sin ambigüedades y normaliza lo que escribe el usuario', () => {
    const codes = new Set(Array.from({ length: 200 }, () => ReferralCode.generate()));
    expect(codes.size).toBeGreaterThan(195);
    for (const code of codes) expect(code).toMatch(/^[2-9A-HJKMNP-Z]{8}$/);
    expect(ReferralCode.parse(' k7m2q9xa ')).toBe('K7M2Q9XA');
    for (const invalid of ['', 'K7M2Q9X', 'K7M2Q9XAB', 'K7M2Q9X0', 'K7M2Q9XI']) {
      expect(() => ReferralCode.parse(invalid)).toThrow(
        expect.objectContaining({ code: 'VALIDATION_ERROR' }),
      );
    }
  });
});
