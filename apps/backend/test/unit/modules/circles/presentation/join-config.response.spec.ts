import { JoinConfig } from '@src/modules/circles/domain/entities/join-config';
import { PayoutRange } from '@src/modules/circles/domain/value-objects/payout-range';
import { JoinConfigResponse } from '@src/modules/circles/presentation/http/dto/join-config.response';
import { Money } from '@src/shared/domain/value-objects/money';

const usd = (amount: number) => Money.of(amount, 'USD');

describe('JoinConfigResponse', () => {
  it('serializa el límite del usuario con la moneda del dominio', () => {
    const config = JoinConfig.create({
      payoutRange: PayoutRange.create({ min: usd(1_000), max: usd(5_000), step: usd(1_000) }),
      savingProgramMax: usd(9_000),
      userPayoutLimit: usd(3_000),
      durationOptions: [6, 12],
    });

    expect(JoinConfigResponse.from(config)).toEqual({
      payout: {
        min: { amount: 1_000, currency: 'USD' },
        max: { amount: 5_000, currency: 'USD' },
        step: { amount: 1_000, currency: 'USD' },
      },
      userPayoutLimit: { amount: 3_000, currency: 'USD' },
      savingProgramMax: { amount: 9_000, currency: 'USD' },
    });
  });
});
