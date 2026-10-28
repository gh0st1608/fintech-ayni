import { type PayoutMethodRepositoryPort } from '@src/modules/payouts/application/ports/payout.ports';
import {
  GetSelectedPayoutMethodUseCase,
  ListPayoutMethodsUseCase,
  SelectPayoutMethodUseCase,
} from '@src/modules/payouts/application/use-cases/payout-method.use-cases';
import {
  PayoutMethodCatalog,
  type PayoutMethodType,
} from '@src/modules/payouts/domain/payout-method';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';

const CATALOG = PayoutMethodCatalog.create([
  { type: 'digital_wallet', available: true, badges: [], limit: null },
  {
    type: 'prepaid_card',
    available: true,
    badges: ['no_charge'],
    limit: Money.of(10_000_000, 'PEN'),
  },
  { type: 'fawry', available: false, badges: [], limit: null },
]);
const ANA = { userId: 'ana' };
/** 2026-11-15 en Lima. */
const NOW = new Date('2026-11-15T15:00:00Z');

function setup(options: { selected?: PayoutMethodType; payoutPeriods?: Period[] } = {}) {
  let selected: PayoutMethodType | null = options.selected ?? null;
  const selections: PayoutMethodRepositoryPort = {
    selectedBy: () => Promise.resolve(selected),
    select: jest.fn((_userId: string, type: PayoutMethodType) => {
      selected = type;
      return Promise.resolve();
    }),
  };
  const catalogs = { forUser: () => Promise.resolve(CATALOG) };
  const schedule = { payoutPeriodsOf: () => Promise.resolve(options.payoutPeriods ?? []) };
  return {
    selections,
    list: new ListPayoutMethodsUseCase(catalogs, selections),
    select: new SelectPayoutMethodUseCase(
      catalogs,
      selections,
      schedule,
      { timeZone: 'America/Lima' },
      new TestClock(NOW),
    ),
  };
}

describe('PayoutMethodCatalog', () => {
  it('rechaza un catálogo con métodos repetidos', () => {
    const wallet = { type: 'digital_wallet' as const, available: true, badges: [], limit: null };
    expect(() => PayoutMethodCatalog.create([wallet, wallet])).toThrow(
      expect.objectContaining({ code: 'INVALID_PAYOUT_METHODS' }),
    );
  });
});

describe('Métodos de cobro', () => {
  it('lista el catálogo con el método actual', async () => {
    const { list } = setup({ selected: 'prepaid_card' });
    const view = await list.execute(ANA);
    expect(view.selected).toBe('prepaid_card');
    expect(view.methods.map(({ type }) => type)).toEqual([
      'digital_wallet',
      'prepaid_card',
      'fawry',
    ]);
  });

  it('guarda un método disponible', async () => {
    const { select } = setup();
    await expect(select.execute(ANA, 'digital_wallet')).resolves.toMatchObject({
      selected: 'digital_wallet',
    });
  });

  it.each(['fawry', 'cheque'])('rechaza %s: no disponible o inexistente', async (type) => {
    const { select, selections } = setup();
    await expect(select.execute(ANA, type)).rejects.toMatchObject({
      code: 'PAYOUT_METHOD_NOT_AVAILABLE',
    });
    expect(selections.select).not.toHaveBeenCalled();
  });

  it('no permite cambiarlo durante un mes de payout del usuario', async () => {
    const { select } = setup({ selected: 'prepaid_card', payoutPeriods: [Period.of(2026, 11)] });
    await expect(select.execute(ANA, 'digital_wallet')).rejects.toMatchObject({
      code: 'PAYOUT_METHOD_CHANGE_NOT_ALLOWED',
    });
    // Volver a elegir el mismo no es un cambio.
    await expect(select.execute(ANA, 'prepaid_card')).resolves.toMatchObject({
      selected: 'prepaid_card',
    });
  });

  it('sí permite cambiarlo antes o después de su mes de payout, o al elegir por primera vez', async () => {
    const periods = [Period.of(2026, 12), Period.of(2026, 10)];
    await expect(
      setup({ selected: 'prepaid_card', payoutPeriods: periods }).select.execute(
        ANA,
        'digital_wallet',
      ),
    ).resolves.toMatchObject({ selected: 'digital_wallet' });
    await expect(
      setup({ payoutPeriods: [Period.of(2026, 11)] }).select.execute(ANA, 'digital_wallet'),
    ).resolves.toMatchObject({ selected: 'digital_wallet' });
  });
});

describe('GetSelectedPayoutMethodUseCase', () => {
  const selected = (type: PayoutMethodType | null) =>
    new GetSelectedPayoutMethodUseCase(
      { forUser: () => Promise.resolve(CATALOG) },
      { selectedBy: () => Promise.resolve(type), select: () => Promise.resolve() },
    ).execute('ana');

  it('devuelve el método elegido con su límite', async () => {
    await expect(selected('prepaid_card')).resolves.toMatchObject({
      type: 'prepaid_card',
      limit: Money.of(10_000_000, 'PEN'),
    });
  });

  it('sin método, o con uno que ya no está disponible, devuelve null', async () => {
    await expect(selected(null)).resolves.toBeNull();
    await expect(selected('fawry')).resolves.toBeNull();
    await expect(selected('bank_transfer')).resolves.toBeNull();
  });
});
