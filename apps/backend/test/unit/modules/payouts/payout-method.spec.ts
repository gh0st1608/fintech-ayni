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
  { type: 'bank_account', available: true, badges: ['no_charge'], limit: null },
  { type: 'wallet', available: true, badges: [], limit: Money.of(500_000, 'PEN') },
]);
/** Billetera deshabilitada ("Not available"), p. ej. mientras no haya proveedor. */
const WITHOUT_WALLET = PayoutMethodCatalog.create([
  { type: 'bank_account', available: true, badges: [], limit: null },
  { type: 'wallet', available: false, badges: [], limit: null },
]);
const ANA = { userId: 'ana' };
/** 2026-11-15 en Lima. */
const NOW = new Date('2026-11-15T15:00:00Z');

function setup(
  options: {
    selected?: PayoutMethodType;
    payoutPeriods?: Period[];
    catalog?: PayoutMethodCatalog;
  } = {},
) {
  let selected: PayoutMethodType | null = options.selected ?? null;
  const selections: PayoutMethodRepositoryPort = {
    selectedBy: () => Promise.resolve(selected),
    select: jest.fn((_userId: string, type: PayoutMethodType) => {
      selected = type;
      return Promise.resolve();
    }),
  };
  const catalogs = { forUser: () => Promise.resolve(options.catalog ?? CATALOG) };
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
    const wallet = { type: 'wallet' as const, available: true, badges: [], limit: null };
    expect(() => PayoutMethodCatalog.create([wallet, wallet])).toThrow(
      expect.objectContaining({ code: 'INVALID_PAYOUT_METHODS' }),
    );
  });
});

describe('Métodos de cobro (Perú, COPAYNI-95)', () => {
  it('lista el catálogo con el método actual', async () => {
    const { list } = setup({ selected: 'wallet' });
    const view = await list.execute(ANA);
    expect(view.selected).toBe('wallet');
    expect(view.methods.map(({ type }) => type)).toEqual(['bank_account', 'wallet']);
  });

  it('guarda un método disponible', async () => {
    const { select } = setup();
    await expect(select.execute(ANA, 'bank_account')).resolves.toMatchObject({
      selected: 'bank_account',
    });
  });

  it.each([
    ['wallet', WITHOUT_WALLET],
    ['cheque', CATALOG],
    ['prepaid_card', CATALOG],
  ] as const)('rechaza %s: no disponible o inexistente', async (type, catalog) => {
    const { select, selections } = setup({ catalog });
    await expect(select.execute(ANA, type)).rejects.toMatchObject({
      code: 'PAYOUT_METHOD_NOT_AVAILABLE',
    });
    expect(selections.select).not.toHaveBeenCalled();
  });

  it('no permite cambiarlo durante un mes de payout del usuario', async () => {
    const { select } = setup({ selected: 'wallet', payoutPeriods: [Period.of(2026, 11)] });
    await expect(select.execute(ANA, 'bank_account')).rejects.toMatchObject({
      code: 'PAYOUT_METHOD_CHANGE_NOT_ALLOWED',
    });
    // Volver a elegir el mismo no es un cambio.
    await expect(select.execute(ANA, 'wallet')).resolves.toMatchObject({ selected: 'wallet' });
  });

  it('sí permite cambiarlo antes o después de su mes de payout, o al elegir por primera vez', async () => {
    const periods = [Period.of(2026, 12), Period.of(2026, 10)];
    await expect(
      setup({ selected: 'wallet', payoutPeriods: periods }).select.execute(ANA, 'bank_account'),
    ).resolves.toMatchObject({ selected: 'bank_account' });
    await expect(
      setup({ payoutPeriods: [Period.of(2026, 11)] }).select.execute(ANA, 'bank_account'),
    ).resolves.toMatchObject({ selected: 'bank_account' });
  });
});

describe('GetSelectedPayoutMethodUseCase', () => {
  const selected = (type: PayoutMethodType | null, catalog = CATALOG) =>
    new GetSelectedPayoutMethodUseCase(
      { forUser: () => Promise.resolve(catalog) },
      { selectedBy: () => Promise.resolve(type), select: () => Promise.resolve() },
    ).execute('ana');

  it('devuelve el método elegido con su límite', async () => {
    await expect(selected('wallet')).resolves.toMatchObject({
      type: 'wallet',
      limit: Money.of(500_000, 'PEN'),
    });
  });

  it('sin método, o con uno que ya no está disponible, devuelve null', async () => {
    await expect(selected(null)).resolves.toBeNull();
    await expect(selected('wallet', WITHOUT_WALLET)).resolves.toBeNull();
  });
});
