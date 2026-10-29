import { ListMyCirclesUseCase } from '@src/modules/circles/application/use-cases/list-my-circles.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import { TEST_PRICING } from '@test/support/join-circle.fixture';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const ANA = { userId: 'ana' };
/** 15 de octubre de 2026 en Lima. */
const NOW = new Date('2026-10-15T15:00:00Z');

function setup() {
  const circles = new InMemoryCircleRepository();
  const useCase = new ListMyCirclesUseCase(
    circles,
    TEST_PRICING,
    { strategy: 'fill_oldest', startOffsetMonths: 1, timeZone: 'America/Lima' },
    new TestClock(NOW),
  );
  const addCircle = (id: string, startsOn: Period, position = 1, months = 6) =>
    circles.add(
      Circle.restore({
        id,
        terms: CircleTerms.create({ payout: pen(30_000), months, startsOn }),
        memberships: [{ userId: 'ana', position, idempotencyKey: `k-${id}` }],
      }),
    );
  return { useCase, addCircle };
}

describe('CircleTerms: fin del círculo', () => {
  const terms = CircleTerms.create({
    payout: pen(30_000),
    months: 6,
    startsOn: Period.of(2026, 5),
  });

  it('termina en el mes del último cobro', () => {
    expect(terms.endsOn).toEqual(Period.of(2026, 10));
    expect(terms.isFinishedAt(Period.of(2026, 10))).toBe(false);
    expect(terms.isFinishedAt(Period.of(2026, 11))).toBe(true);
    expect(terms.isFinishedAt(Period.of(2026, 1))).toBe(false);
  });
});

describe('ListMyCirclesUseCase', () => {
  it('separa activos (también los que no empezaron) de finalizados, el más reciente primero', async () => {
    const { useCase, addCircle } = setup();
    addCircle('terminado', Period.of(2026, 1));
    addCircle('en-curso', Period.of(2026, 5), 3);
    addCircle('por-empezar', Period.of(2026, 11));

    const active = await useCase.execute(ANA, { status: 'active', cursor: null });
    expect(active.items.map(({ circleId }) => circleId)).toEqual(['por-empezar', 'en-curso']);
    expect(active.items[1]).toMatchObject({ status: 'active', quote: { position: 3 } });
    expect(active.items[1]?.quote).toEqual(TEST_PRICING.quote(active.items[1]!.terms, 3));

    const finished = await useCase.execute(ANA, { status: 'finished', cursor: null });
    expect(finished.items.map(({ circleId }) => circleId)).toEqual(['terminado']);
    expect(finished.nextCursor).toBeNull();
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
