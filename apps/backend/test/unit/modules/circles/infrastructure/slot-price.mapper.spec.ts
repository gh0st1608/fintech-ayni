import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import {
  fromStoredPrice,
  type StoredSlotPrice,
  toStoredPrice,
} from '@src/modules/circles/infrastructure/persistence/typeorm/slot-price.mapper';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TEST_PRICING } from '@test/support/join-circle.fixture';

const terms = CircleTerms.create({
  payout: Money.of(3_000_000, 'PEN'),
  months: 10,
  startsOn: Period.of(2026, 11),
});

describe('slot-price.mapper', () => {
  it('guarda los montos en unidades menores y los reconstruye igual', () => {
    const price = priceOf(TEST_PRICING.quote(terms, 2));
    const stored = toStoredPrice(price);

    expect(stored).toMatchObject({ currency: 'PEN', type: 'fastest_payout' });
    expect(stored.installments).toHaveLength(10);
    expect(fromStoredPrice(JSON.parse(JSON.stringify(stored)) as StoredSlotPrice)).toEqual(price);
  });

  it('rechaza un precio guardado dañado', () => {
    const stored = toStoredPrice(priceOf(TEST_PRICING.quote(terms, 2)));

    expect(() => fromStoredPrice({ ...stored, type: 'otro' as never })).toThrow(
      'El precio guardado de la membresía no es válido',
    );
    expect(() => fromStoredPrice({ ...stored, installments: null as never })).toThrow(
      'El precio guardado de la membresía no es válido',
    );
    expect(() => fromStoredPrice({ ...stored, fee: 1.5 })).toThrow(
      expect.objectContaining({ code: 'INVALID_MONEY' }),
    );
  });
});
