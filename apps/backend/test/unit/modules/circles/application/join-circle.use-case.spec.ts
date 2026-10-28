import { Logger } from '@nestjs/common';

import { IdempotencyKeyExistsError } from '@src/modules/circles/application/ports/circle-repository.port';
import { type JoinCircleCommand } from '@src/modules/circles/application/use-cases/join-circle.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { type JoinApplicant } from '@src/modules/circles/domain/services/join-eligibility';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import { createJoinCircleUseCase, ELIGIBLE, TEST_PRICING } from '@test/support/join-circle.fixture';

const pen = (major: number) => Money.of(major * 100, 'PEN');

/** Payout de 30.000 en 10 meses, como en el Figma. */
const NEW_CIRCLE: JoinCircleCommand = {
  userId: 'ana',
  circleId: null,
  payoutAmount: 3_000_000,
  months: 10,
  position: 3,
  idempotencyKey: 'key-ana-0000000001',
};

function setup(applicant: Partial<JoinApplicant> = {}) {
  const circles = new InMemoryCircleRepository();
  // Mutable: el caso de uso lo lee en cada ejecución, así se simula un cambio de elegibilidad.
  const current: { -readonly [K in keyof JoinApplicant]: JoinApplicant[K] } = {
    ...ELIGIBLE,
    ...applicant,
  };
  const useCase = createJoinCircleUseCase(circles, { applicant: current });
  const addCircle = (id: string, props: { startsOn?: Period; months?: number } = {}) =>
    circles.add(
      Circle.open({
        id,
        terms: CircleTerms.create({
          payout: pen(30_000),
          months: props.months ?? 10,
          startsOn: props.startsOn ?? Period.of(2026, 12),
        }),
      }),
    );
  return { circles, useCase, current, addCircle };
}

describe('JoinCircleUseCase', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => log.mockRestore());

  it('con circleId null abre el círculo nuevo que ofreció slots, desde el mes siguiente', async () => {
    const { circles, useCase } = setup();
    const result = await useCase.execute(NEW_CIRCLE);

    expect(result).toMatchObject({ created: true, membership: { userId: 'ana', position: 3 } });
    expect(result.terms.startsOn).toEqual(Period.of(2026, 11));
    expect(result.terms.payout).toEqual(pen(30_000));
    expect(result.quote).toEqual(TEST_PRICING.quote(result.terms, 3));
    expect(circles.membershipsOf(result.circleId)).toEqual([
      { userId: 'ana', position: 3, idempotencyKey: NEW_CIRCLE.idempotencyKey },
    ]);
    // Auditoría: quién se unió, a qué círculo y en qué slot.
    expect(log).toHaveBeenCalledWith({
      event: 'circles.joined',
      userId: 'ana',
      circleId: result.circleId,
      position: 3,
      newCircle: true,
    });
  });

  it('se une al círculo ofrecido', async () => {
    const { circles, useCase, addCircle } = setup();
    addCircle('c-1');
    const result = await useCase.execute({ ...NEW_CIRCLE, circleId: 'c-1' });

    expect(result).toMatchObject({ circleId: 'c-1', created: true });
    expect(result.quote.payoutPeriod).toEqual(Period.of(2027, 2));
    expect(circles.size).toBe(1);
  });

  it('un reintento responde la misma unión sin abrir otro círculo, aunque cambie la elegibilidad', async () => {
    const { circles, useCase, current } = setup();
    const first = await useCase.execute(NEW_CIRCLE);
    current.payoutMethod = null;

    const retry = await useCase.execute(NEW_CIRCLE);
    expect(retry).toMatchObject({ circleId: first.circleId, created: false });
    expect(retry.quote).toEqual(first.quote);
    expect(circles.size).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('el mismo pedido enviado dos veces a la vez abre un solo círculo', async () => {
    const { circles, useCase } = setup();
    const [first, second] = await Promise.all([
      useCase.execute(NEW_CIRCLE),
      useCase.execute(NEW_CIRCLE),
    ]);

    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.circleId).toBe(second.circleId);
    expect(circles.size).toBe(1);
  });

  it.each([
    ['otro slot', { position: 4 }],
    ['otro payout', { payoutAmount: 2_400_000 }],
    ['otro círculo', { circleId: 'c-1' }],
  ])('la misma clave con %s responde IDEMPOTENCY_KEY_REUSED', async (_, change) => {
    const { useCase } = setup();
    await useCase.execute(NEW_CIRCLE);
    await expect(useCase.execute({ ...NEW_CIRCLE, ...change })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
      kind: 'conflict',
    });
  });

  it('si la clave choca con la de otro usuario en el círculo responde IDEMPOTENCY_KEY_REUSED', async () => {
    const { circles, useCase, addCircle } = setup();
    addCircle('c-1');
    jest.spyOn(circles, 'addMembership').mockRejectedValueOnce(new IdempotencyKeyExistsError());

    await expect(useCase.execute({ ...NEW_CIRCLE, circleId: 'c-1' })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_KEY_REUSED',
    });
  });

  it.each([
    ['NATIONAL_ID_REQUIRED', { identityVerified: false }],
    ['MONTHLY_LIMIT_EXCEEDED', { monthlyPayInLimit: pen(3_000) }],
    ['PAYOUT_METHOD_REQUIRED', { payoutMethod: null }],
    ['PAYOUT_METHOD_LIMIT_EXCEEDED', { payoutMethod: { type: 'prepaid_card', limit: pen(1) } }],
  ])('sin cumplir un requisito (%s) no reserva nada', async (code, applicant) => {
    const { circles, useCase } = setup(applicant);
    await expect(useCase.execute(NEW_CIRCLE)).rejects.toMatchObject({ code, kind: 'domain' });
    expect(circles.size).toBe(0);
  });

  it('valida las condiciones como slots', async () => {
    const { useCase } = setup();
    await expect(useCase.execute({ ...NEW_CIRCLE, months: 7 })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { months: 'not_offered' },
    });
    await expect(useCase.execute({ ...NEW_CIRCLE, payoutAmount: 3_000_001 })).rejects.toMatchObject(
      { code: 'PAYOUT_NOT_ALLOWED' },
    );
    await expect(useCase.execute({ ...NEW_CIRCLE, position: 11 })).rejects.toMatchObject({
      code: 'SLOT_OUT_OF_RANGE',
    });
  });

  it('rechaza un círculo inexistente, con otras condiciones o que ya empezó', async () => {
    const { useCase, addCircle } = setup();
    addCircle('c-12', { months: 12 });
    addCircle('c-started', { startsOn: Period.of(2026, 10) });

    await expect(useCase.execute({ ...NEW_CIRCLE, circleId: 'nope' })).rejects.toMatchObject({
      code: 'CIRCLE_NOT_FOUND',
      kind: 'not_found',
    });
    await expect(useCase.execute({ ...NEW_CIRCLE, circleId: 'c-12' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { circleId: 'terms_mismatch' },
    });
    await expect(useCase.execute({ ...NEW_CIRCLE, circleId: 'c-started' })).rejects.toMatchObject({
      code: 'CIRCLE_ALREADY_STARTED',
      kind: 'conflict',
    });
  });

  it('propaga los errores del repositorio que no son de idempotencia', async () => {
    const { circles, useCase } = setup();
    const failure = new Error('conexión perdida');
    jest.spyOn(circles, 'create').mockRejectedValueOnce(failure);

    await expect(useCase.execute(NEW_CIRCLE)).rejects.toBe(failure);
  });
});
