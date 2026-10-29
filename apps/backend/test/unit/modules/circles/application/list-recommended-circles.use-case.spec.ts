import { ListRecommendedCirclesUseCase } from '@src/modules/circles/application/use-cases/list-recommended-circles.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import { TEST_JOIN_CONFIG, TEST_PRICING } from '@test/support/join-circle.fixture';

const pen = (major: number) => Money.of(major * 100, 'PEN');
const ANA = { userId: 'ana' };
/** 15 de octubre de 2026 en Lima. */
const NOW = new Date('2026-10-15T15:00:00Z');

function setup(limit = 5) {
  const circles = new InMemoryCircleRepository();
  const useCase = new ListRecommendedCirclesUseCase(
    { getForUser: () => Promise.resolve(TEST_JOIN_CONFIG) },
    circles,
    TEST_PRICING,
    { strategy: 'fill_oldest', startOffsetMonths: 1, timeZone: 'America/Lima' },
    { limit },
    new TestClock(NOW),
  );
  const addCircle = (
    id: string,
    props: { payout?: Money; months?: number; startsOn?: Period; members?: string[] } = {},
  ) =>
    circles.add(
      Circle.restore({
        id,
        terms: CircleTerms.create({
          payout: props.payout ?? pen(30_000),
          months: props.months ?? 6,
          startsOn: props.startsOn ?? Period.of(2026, 11),
        }),
        memberships: (props.members ?? []).map((userId, index) => ({
          userId,
          position: index + 1,
          idempotencyKey: `k-${id}-${userId}`,
        })),
      }),
    );
  return { useCase, addCircle };
}

describe('ListRecommendedCirclesUseCase', () => {
  it('recomienda los círculos que admiten al usuario, del más antiguo al más nuevo', async () => {
    const { useCase, addCircle } = setup();
    addCircle('empezado', { startsOn: Period.of(2026, 10) });
    addCircle('lleno', { members: ['b', 'c', 'd', 'e', 'f', 'g'] });
    addCircle('ya-es-miembro', { members: ['ana'] });
    addCircle('payout-fuera-de-rango', { payout: pen(240_000) });
    addCircle('duracion-no-ofrecida', { months: 8 });
    addCircle('viejo', { members: ['b'] });
    addCircle('nuevo', { startsOn: Period.of(2027, 1) });

    const recommended = await useCase.execute(ANA);
    expect(recommended.map(({ circleId }) => circleId)).toEqual(['viejo', 'nuevo']);
    expect(recommended[0]).toMatchObject({
      availableSlots: 5,
      adminFee: TEST_PRICING.quote(recommended[0]!.terms, 1).adminFee,
    });
    expect(recommended[0]?.terms.baseInstallment).toEqual(pen(5_000));
  });

  it('respeta el límite configurado', async () => {
    const { useCase, addCircle } = setup(2);
    ['a', 'b', 'c'].forEach((id) => addCircle(id));
    await expect(useCase.execute(ANA)).resolves.toHaveLength(2);
  });

  it('sin círculos abiertos no recomienda nada', async () => {
    await expect(setup().useCase.execute(ANA)).resolves.toEqual([]);
  });
});
