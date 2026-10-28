import { JoinCircleUseCase } from '@src/modules/circles/application/use-cases/join-circle.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';

const MONTHS = 12;

/**
 * Concurrencia de la reserva de slots: las solicitudes se intercalan entre la lectura y la
 * escritura, como en producción. La barrera final es la inserción atómica del repositorio;
 * con PostgreSQL (COPAYNI-12) esta prueba se repite contra la base real.
 */
describe('JoinCircleUseCase: solicitudes simultáneas', () => {
  let repository: InMemoryCircleRepository;
  let useCase: JoinCircleUseCase;

  beforeEach(() => {
    repository = new InMemoryCircleRepository();
    repository.add(
      Circle.open({
        id: 'c-1',
        terms: CircleTerms.create({
          payout: Money.of(2_400_000, 'PEN'),
          months: MONTHS,
          startsOn: Period.of(2026, 11),
        }),
      }),
    );
    useCase = new JoinCircleUseCase(repository);
  });

  const join = (userId: string, position: number, idempotencyKey = `key-${userId}`) =>
    useCase.execute({ circleId: 'c-1', userId, position, idempotencyKey });

  it('dos usuarios por el mismo slot: uno lo obtiene y el otro recibe SLOT_TAKEN', async () => {
    const results = await Promise.allSettled([join('ana', 1), join('beto', 1)]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'SLOT_TAKEN' }),
    });
    expect(repository.membershipsOf('c-1')).toHaveLength(1);
  });

  it('doce usuarios por slots distintos a la vez: todos entran, sin conflictos', async () => {
    const results = await Promise.all(
      Array.from({ length: MONTHS }, (_, index) => join(`user-${index}`, index + 1)),
    );

    expect(results.every(({ created }) => created)).toBe(true);
    const circle = await repository.findById('c-1');
    expect(circle?.status).toBe('full');
  });

  it('el mismo pedido enviado dos veces a la vez crea una sola membresía', async () => {
    const [first, second] = await Promise.all([join('ana', 3), join('ana', 3)]);

    expect([first.created, second.created].sort()).toEqual([false, true]);
    expect(first.membership).toEqual(second.membership);
    expect(repository.membershipsOf('c-1')).toEqual([
      { userId: 'ana', position: 3, idempotencyKey: 'key-ana' },
    ]);
  });

  it('la misma clave a la vez con otro slot: el perdedor recibe IDEMPOTENCY_KEY_REUSED', async () => {
    const results = await Promise.allSettled([join('ana', 1, 'k'), join('ana', 2, 'k')]);

    expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'IDEMPOTENCY_KEY_REUSED' }),
    });
    expect(repository.membershipsOf('c-1')).toHaveLength(1);
  });

  it('un usuario pidiendo dos slots a la vez se queda con uno solo', async () => {
    const results = await Promise.allSettled([join('ana', 1, 'k1'), join('ana', 2, 'k2')]);

    expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'ALREADY_MEMBER' }),
    });
    expect(repository.membershipsOf('c-1')).toHaveLength(1);
  });

  it('un reintento posterior con la misma clave no vuelve a escribir', async () => {
    await join('ana', 5);
    const addMembership = jest.spyOn(repository, 'addMembership');

    await expect(join('ana', 5)).resolves.toMatchObject({ created: false });
    expect(addMembership).not.toHaveBeenCalled();
  });

  it('un círculo inexistente responde CIRCLE_NOT_FOUND', async () => {
    await expect(
      useCase.execute({ circleId: 'nope', userId: 'ana', position: 1, idempotencyKey: 'k' }),
    ).rejects.toMatchObject({ code: 'CIRCLE_NOT_FOUND', kind: 'not_found' });
  });

  it('propaga los errores del repositorio que no son de idempotencia', async () => {
    const failure = new Error('conexión perdida');
    jest.spyOn(repository, 'addMembership').mockRejectedValueOnce(failure);

    await expect(join('ana', 1)).rejects.toBe(failure);
  });
});
