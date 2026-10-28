import { randomUUID } from 'node:crypto';

import { type DataSource } from 'typeorm';

import { JoinCircleUseCase } from '@src/modules/circles/application/use-cases/join-circle.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { CircleMembershipEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle.entity';
import { TypeOrmCircleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle.repository';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

const MONTHS = 12;

/**
 * El adaptador contra PostgreSQL real: mapeo, índices únicos y las mismas carreras que
 * join-circle.concurrency.spec.ts, ahora con la base como barrera final.
 */
describe('TypeOrmCircleRepository', () => {
  let dataSource: DataSource;
  let repository: TypeOrmCircleRepository;
  let useCase: JoinCircleUseCase;
  let circleId: string;

  beforeAll(async () => {
    dataSource = await openTestDatabase([CircleEntity, CircleMembershipEntity]);
    repository = new TypeOrmCircleRepository(
      dataSource.getRepository(CircleEntity),
      dataSource.getRepository(CircleMembershipEntity),
    );
    useCase = new JoinCircleUseCase(repository);
  });

  afterAll(() => dataSource.destroy());

  beforeEach(async () => {
    circleId = randomUUID();
    await repository.create(
      Circle.open({
        id: circleId,
        terms: CircleTerms.create({
          payout: Money.of(2_400_000, 'PEN'),
          months: MONTHS,
          startsOn: Period.of(2026, 11),
        }),
      }),
    );
  });

  const user = (): Promise<string> => insertTestUser(dataSource);
  const join = (userId: string, position: number, idempotencyKey = `key-${userId}`) =>
    useCase.execute({ circleId, userId, position, idempotencyKey });
  const membershipCount = () =>
    dataSource.getRepository(CircleMembershipEntity).countBy({ circleId });

  it('guarda y reconstruye el círculo con sus condiciones y membresías', async () => {
    const ana = await user();
    await join(ana, 4);

    const circle = await repository.findById(circleId);
    expect(circle?.terms.payout).toMatchObject({ amount: 2_400_000, currency: 'PEN' });
    expect(circle?.terms.months).toBe(MONTHS);
    expect(circle?.terms.startsOn.toString()).toBe('2026-11');
    expect(circle?.memberships).toEqual([
      { userId: ana, position: 4, idempotencyKey: `key-${ana}` },
    ]);
  });

  it('guarda un círculo con membresías iniciales', async () => {
    const id = randomUUID();
    const terms = CircleTerms.create({
      payout: Money.of(600_000, 'PEN'),
      months: 6,
      startsOn: Period.of(2027, 1),
    });
    const member = { userId: await user(), position: 2, idempotencyKey: 'k' };
    await repository.create(Circle.restore({ id, terms, memberships: [member] }));

    expect((await repository.findById(id))?.memberships).toEqual([member]);
  });

  it('un id inexistente o que no es uuid devuelve null', async () => {
    await expect(repository.findById(randomUUID())).resolves.toBeNull();
    await expect(repository.findById('nope')).resolves.toBeNull();
  });

  it('dos usuarios por el mismo slot: uno lo obtiene y el otro recibe SLOT_TAKEN', async () => {
    const [ana, beto] = [await user(), await user()];
    const results = await Promise.allSettled([join(ana, 1), join(beto, 1)]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'SLOT_TAKEN' }),
    });
    await expect(membershipCount()).resolves.toBe(1);
  });

  it('doce usuarios por slots distintos a la vez: todos entran', async () => {
    const users = await Promise.all(Array.from({ length: MONTHS }, () => user()));
    const results = await Promise.all(users.map((userId, index) => join(userId, index + 1)));

    expect(results.every(({ created }) => created)).toBe(true);
    expect((await repository.findById(circleId))?.status).toBe('full');
  });

  it('el mismo pedido enviado dos veces a la vez crea una sola membresía', async () => {
    const ana = await user();
    const [first, second] = await Promise.all([join(ana, 3), join(ana, 3)]);

    expect([first.created, second.created].sort()).toEqual([false, true]);
    await expect(membershipCount()).resolves.toBe(1);
  });

  it('un usuario pidiendo dos slots a la vez se queda con uno solo', async () => {
    const ana = await user();
    const results = await Promise.allSettled([join(ana, 1, 'k1'), join(ana, 2, 'k2')]);

    expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ code: 'ALREADY_MEMBER' }),
    });
    await expect(membershipCount()).resolves.toBe(1);
  });

  it('traduce cada índice único al error del puerto', async () => {
    const ana = await user();
    await repository.addMembership(circleId, { userId: ana, position: 1, idempotencyKey: 'a' });

    await expect(
      repository.addMembership(circleId, {
        userId: await user(),
        position: 1,
        idempotencyKey: 'b',
      }),
    ).rejects.toMatchObject({ code: 'SLOT_TAKEN' });
    await expect(
      repository.addMembership(circleId, { userId: ana, position: 2, idempotencyKey: 'c' }),
    ).rejects.toMatchObject({ code: 'ALREADY_MEMBER' });
    await expect(
      repository.addMembership(circleId, {
        userId: await user(),
        position: 3,
        idempotencyKey: 'a',
      }),
    ).rejects.toThrow('Ya existe una membresía con esa clave de idempotencia');
  });

  it('una membresía de un círculo inexistente responde CIRCLE_NOT_FOUND', async () => {
    await expect(
      repository.addMembership(randomUUID(), {
        userId: await user(),
        position: 1,
        idempotencyKey: 'k',
      }),
    ).rejects.toMatchObject({ code: 'CIRCLE_NOT_FOUND' });
  });

  it('un usuario inexistente no se confunde con un círculo inexistente', async () => {
    await expect(
      repository.addMembership(circleId, {
        userId: randomUUID(),
        position: 1,
        idempotencyKey: 'k',
      }),
    ).rejects.toThrow(/fk_circle_memberships_user/);
  });

  it('propaga los errores que no son de unicidad', async () => {
    await expect(
      repository.addMembership(circleId, {
        userId: await user(),
        position: 0,
        idempotencyKey: 'k',
      }),
    ).rejects.toThrow(/check constraint/);
  });
});
