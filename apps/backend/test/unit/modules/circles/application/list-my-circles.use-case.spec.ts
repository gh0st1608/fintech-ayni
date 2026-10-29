import { ListMyCirclesUseCase } from '@src/modules/circles/application/use-cases/list-my-circles.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { priceOf, SlotPricing } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import { TEST_PRICING, TEST_PRICING_RULES } from '@test/support/join-circle.fixture';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const ANA = { userId: 'ana' };
/** Reglas con las que se unió un miembro antes de un cambio de configuración. */
const OTHER_PRICING = new SlotPricing(
  SlotPricingRules.create({ ...TEST_PRICING_RULES.props, adminFeeBps: 2_000 }),
);

function setup() {
  const circles = new InMemoryCircleRepository();
  const useCase = new ListMyCirclesUseCase(circles, TEST_PRICING);
  const addCircle = (id: string, startsOn: Period, position = 1, months = 6) =>
    circles.add(
      Circle.restore({
        id,
        terms: CircleTerms.create({ payout: pen(30_000), months, startsOn }),
        memberships: [{ userId: 'ana', position, idempotencyKey: `k-${id}` }],
      }),
    );
  return { useCase, addCircle, circles };
}

describe('CircleTerms: fin del círculo', () => {
  it('termina en el mes del último cobro', () => {
    const terms = CircleTerms.create({
      payout: pen(30_000),
      months: 6,
      startsOn: Period.of(2026, 5),
    });
    expect(terms.endsOn).toEqual(Period.of(2026, 10));
  });
});

describe('ListMyCirclesUseCase', () => {
  it('separa activos (también los que no empezaron) de los que terminaron su ciclo, el más reciente primero', async () => {
    const { useCase, addCircle, circles } = setup();
    addCircle('terminado', Period.of(2026, 1));
    circles.finish('terminado');
    addCircle('en-curso', Period.of(2026, 5), 3);
    addCircle('por-empezar', Period.of(2026, 11));

    const active = await useCase.execute(ANA, { status: 'active', cursor: null });
    expect(active.items.map(({ circleId }) => circleId)).toEqual(['por-empezar', 'en-curso']);
    expect(active.items[1]).toMatchObject({ status: 'active', quote: { position: 3 } });
    expect(active.items[1]?.quote).toEqual(TEST_PRICING.quote(active.items[1]!.terms, 3));

    const finished = await useCase.execute(ANA, { status: 'finished', cursor: null });
    expect(finished.items.map(({ circleId }) => circleId)).toEqual(['terminado']);
    expect(finished.nextCursor).toBeNull();
    expect(active.items.every(({ expelled }) => !expelled)).toBe(true);
  });

  it('una membresía expulsada por impago se lista con los finalizados (COPAYNI-57)', async () => {
    const { useCase, addCircle, circles } = setup();
    addCircle('expulsado', Period.of(2026, 5));
    circles.expel('expulsado', 'ana');
    addCircle('en-curso', Period.of(2026, 6));

    const active = await useCase.execute(ANA, { status: 'active', cursor: null });
    expect(active.items.map(({ circleId }) => circleId)).toEqual(['en-curso']);
    const finished = await useCase.execute(ANA, { status: 'finished', cursor: null });
    expect(finished.items).toEqual([
      expect.objectContaining({ circleId: 'expulsado', status: 'finished', expelled: true }),
    ]);
  });

  it('responde el precio congelado al unirse; sin él, cotiza con las reglas vigentes', async () => {
    const { useCase, circles } = setup();
    const terms = CircleTerms.create({
      payout: pen(30_000),
      months: 6,
      startsOn: Period.of(2026, 11),
    });
    const frozen = priceOf(OTHER_PRICING.quote(terms, 2));
    circles.add(
      Circle.restore({
        id: 'congelado',
        terms,
        memberships: [{ userId: 'ana', position: 2, idempotencyKey: 'k-1', price: frozen }],
      }),
    );
    circles.add(
      Circle.restore({
        id: 'anterior',
        terms,
        memberships: [{ userId: 'ana', position: 2, idempotencyKey: 'k-2' }],
      }),
    );

    const { items } = await useCase.execute(ANA, { status: 'active', cursor: null });
    const quoteOf = (id: string) => items.find(({ circleId }) => circleId === id)?.quote;
    expect(quoteOf('congelado')).toEqual(OTHER_PRICING.quote(terms, 2));
    expect(quoteOf('anterior')).toEqual(TEST_PRICING.quote(terms, 2));
  });

  it('pagina con el cursor del repositorio', async () => {
    const { useCase, addCircle } = setup();
    ['a', 'b', 'c'].forEach((id) => addCircle(id, Period.of(2026, 12)));

    const first = await useCase.execute(ANA, { status: 'active', cursor: null, limit: 2 });
    expect(first.items.map(({ circleId }) => circleId)).toEqual(['c', 'b']);
    const second = await useCase.execute(ANA, {
      status: 'active',
      cursor: first.nextCursor,
      limit: 2,
    });
    expect(second.items.map(({ circleId }) => circleId)).toEqual(['a']);
    expect(second.nextCursor).toBeNull();
  });

  it('sin círculos devuelve una página vacía', async () => {
    await expect(setup().useCase.execute(ANA, { status: 'active', cursor: null })).resolves.toEqual(
      { items: [], nextCursor: null },
    );
  });
});
