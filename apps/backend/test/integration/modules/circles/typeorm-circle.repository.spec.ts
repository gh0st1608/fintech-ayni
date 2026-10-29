import { randomUUID } from 'node:crypto';

import { Logger } from '@nestjs/common';
import { type DataSource } from 'typeorm';

import { IdempotencyKeyExistsError } from '@src/modules/circles/application/ports/circle-repository.port';
import { type JoinCircleUseCase } from '@src/modules/circles/application/use-cases/join-circle.use-case';
import { Circle } from '@src/modules/circles/domain/entities/circle';
import { priceOf, SlotPricing } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { CircleMembershipEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from '@src/modules/circles/infrastructure/persistence/typeorm/circle.entity';
import { TypeOrmCircleRepository } from '@src/modules/circles/infrastructure/persistence/typeorm/typeorm-circle.repository';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import {
  createJoinCircleUseCase,
  TEST_PRICING,
  TEST_PRICING_RULES,
} from '@test/support/join-circle.fixture';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

const MONTHS = 12;
const TERMS = { payoutAmount: 2_400_000, months: MONTHS };

/**
 * El adaptador contra PostgreSQL real: mapeo, índices únicos y las mismas carreras que
 * join-circle.concurrency.spec.ts, ahora con la base como barrera final.
 */
describe('TypeOrmCircleRepository', () => {
  beforeAll(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterAll(() => jest.restoreAllMocks());

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
    useCase = createJoinCircleUseCase(repository);
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
    useCase.execute({ circleId, ...TERMS, userId, position, idempotencyKey });
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
      {
        userId: ana,
        position: 4,
        idempotencyKey: `key-${ana}`,
        price: priceOf(TEST_PRICING.quote(circle!.terms, 4)),
      },
    ]);
  });

  it('el precio congelado sobrevive a un cambio de reglas y a la lectura de Mis círculos (COPAYNI-55)', async () => {
    const ana = await user();
    const accepted = (await join(ana, 1)).quote;

    const stored = await dataSource
      .getRepository(CircleMembershipEntity)
      .findOneByOrFail({ circleId, userId: ana });
    expect(stored.price).toMatchObject({ currency: 'PEN', type: 'fastest_payout' });
    expect(stored.price?.installments).toHaveLength(MONTHS);

    const later = new SlotPricing(
      SlotPricingRules.create({ ...TEST_PRICING_RULES.props, adminFeeBps: 2_000 }),
    );
    const circle = await repository.findById(circleId);
    const membership = circle!.memberships[0]!;
    expect(later.quoteOf(circle!.terms, 1, membership.price)).toEqual(accepted);

    const page = await repository.listMemberships({
      userId: ana,
      status: 'active',
      currentPeriod: Period.of(2026, 10),
      limit: 5,
      cursor: null,
    });
    expect(page.items[0]?.price).toEqual(membership.price);
  });

  it('una membresía anterior a COPAYNI-55 se lee sin precio', async () => {
    const ana = await user();
    await join(ana, 2);
    await dataSource
      .getRepository(CircleMembershipEntity)
      .update({ circleId, userId: ana }, { price: null });

    const circle = await repository.findById(circleId);
    expect(circle?.memberships[0]).not.toHaveProperty('price');
    const page = await repository.listMemberships({
      userId: ana,
      status: 'active',
      currentPeriod: Period.of(2026, 10),
      limit: 5,
      cursor: null,
    });
    expect(page.items[0]).not.toHaveProperty('price');
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

  describe('unión a un círculo nuevo (COPAYNI-31)', () => {
    const newCircle = (userId: string, idempotencyKey: string) =>
      Circle.restore({
        id: randomUUID(),
        terms: CircleTerms.create({
          payout: Money.of(2_400_000, 'PEN'),
          months: MONTHS,
          startsOn: Period.of(2026, 11),
        }),
        memberships: [{ userId, position: 1, idempotencyKey }],
      });
    const circleCount = (ids: string[]) =>
      dataSource.getRepository(CircleEntity).countBy(ids.map((id) => ({ id })));

    it('encuentra el círculo por la clave del usuario', async () => {
      const ana = await user();
      await join(ana, 2, 'clave-ana');

      await expect(repository.findByMembershipKey(ana, 'clave-ana')).resolves.toMatchObject({
        id: circleId,
      });
      await expect(repository.findByMembershipKey(ana, 'otra')).resolves.toBeNull();
      await expect(repository.findByMembershipKey(await user(), 'clave-ana')).resolves.toBeNull();
      await expect(repository.findByMembershipKey('user-1', 'clave-ana')).resolves.toBeNull();
    });

    it('la misma clave del usuario en otro círculo no deja un círculo a medias', async () => {
      const ana = await user();
      const first = newCircle(ana, 'clave-nueva');
      const second = newCircle(ana, 'clave-nueva');
      const results = await Promise.allSettled([
        repository.create(first),
        repository.create(second),
      ]);

      expect(results.find(({ status }) => status === 'rejected')).toMatchObject({
        reason: expect.any(IdempotencyKeyExistsError),
      });
      await expect(circleCount([first.id, second.id])).resolves.toBe(1);
    });

    it('una membresía con una clave que el usuario ya usó en otro círculo se rechaza', async () => {
      const ana = await user();
      await repository.create(newCircle(ana, 'clave-usada'));

      await expect(
        repository.addMembership(circleId, {
          userId: ana,
          position: 1,
          idempotencyKey: 'clave-usada',
        }),
      ).rejects.toBeInstanceOf(IdempotencyKeyExistsError);
    });

    it('propaga los errores de create que no son de la clave', async () => {
      await expect(repository.create(newCircle(randomUUID(), 'k'))).rejects.toThrow(
        /fk_circle_memberships_user/,
      );
    });
  });

  describe('findOldestJoinable', () => {
    // Un payout propio para no cruzarse con los círculos de las demás pruebas.
    const payout = Money.of(7_350_000, 'PEN');
    const create = async (startsOn: Period, members: string[] = [], months = 6) => {
      const id = randomUUID();
      await repository.create(
        Circle.restore({
          id,
          terms: CircleTerms.create({ payout, months, startsOn }),
          memberships: members.map((userId, index) => ({
            userId,
            position: index + 1,
            idempotencyKey: `k-${id}-${index}`,
          })),
        }),
      );
      return id;
    };
    const find = (userId: string) =>
      repository.findOldestJoinable({
        payout,
        months: 6,
        startsAfter: Period.of(2030, 1),
        userId,
      });

    it('elige el más antiguo que no empezó, no está lleno y donde el usuario no es miembro', async () => {
      const ana = await user();
      const others = await Promise.all(Array.from({ length: 6 }, () => user()));
      await create(Period.of(2030, 1)); // empieza en el mes actual: ya no se puede unir
      await create(Period.of(2030, 3), others); // lleno
      await create(Period.of(2030, 2), [ana]); // ya es miembro
      const oldest = await create(Period.of(2030, 4), [others[0]!]);
      await create(Period.of(2030, 2));

      const circle = await find(ana);
      expect(circle?.id).toBe(oldest);
      expect(circle?.isTaken(1)).toBe(true);
      expect(circle?.isMember(others[0]!)).toBe(true);
    });

    it('sin candidatos devuelve null, también con un usuario que no es uuid', async () => {
      await expect(
        repository.findOldestJoinable({
          payout: Money.of(7_350_000, 'USD'),
          months: 6,
          startsAfter: Period.of(2030, 1),
          userId: 'user-1',
        }),
      ).resolves.toBeNull();
    });

    it('listJoinable: los que admiten al usuario, del más antiguo al más nuevo y hasta el límite', async () => {
      // Lejos en el futuro: solo estos círculos empiezan después de 2090-12.
      const ana = await user();
      const others = await Promise.all(Array.from({ length: 6 }, () => user()));
      await create(Period.of(2090, 12)); // empieza en el mes "actual"
      await create(Period.of(2091, 2), others); // lleno
      await create(Period.of(2091, 2), [ana]); // ya es miembro
      const first = await create(Period.of(2091, 3), [others[0]!]);
      const second = await create(Period.of(2091, 1), [], 12);
      await create(Period.of(2091, 4));

      const joinable = await repository.listJoinable({
        startsAfter: Period.of(2090, 12),
        userId: ana,
        limit: 2,
      });
      expect(joinable.map(({ id }) => id)).toEqual([first, second]);
      expect(joinable[0]?.isTaken(1)).toBe(true);
      expect(joinable[1]?.terms.months).toBe(12);
    });
  });

  describe('listMemberships (COPAYNI-26)', () => {
    const joinCircle = async (userId: string, startsOn: Period, months = 6) => {
      const id = randomUUID();
      await repository.create(
        Circle.restore({
          id,
          terms: CircleTerms.create({ payout: Money.of(1_200_000, 'PEN'), months, startsOn }),
          memberships: [{ userId, position: 2, idempotencyKey: `k-${id}` }],
        }),
      );
      return id;
    };
    const list = (userId: string, status: 'active' | 'finished', cursor: string | null = null) =>
      repository.listMemberships({
        userId,
        status,
        currentPeriod: Period.of(2026, 10),
        limit: 2,
        cursor,
      });

    it('filtra por estado y pagina de la unión más reciente a la más antigua', async () => {
      const ana = await user();
      const finished = await joinCircle(ana, Period.of(2026, 4)); // terminó en septiembre
      const lastMonth = await joinCircle(ana, Period.of(2026, 5)); // termina este mes: activo
      const started = await joinCircle(ana, Period.of(2026, 8));
      const upcoming = await joinCircle(ana, Period.of(2026, 12));
      await joinCircle(await user(), Period.of(2026, 12)); // de otro usuario

      const first = await list(ana, 'active');
      expect(first.items.map(({ circleId }) => circleId)).toEqual([upcoming, started]);
      expect(first.items[0]).toMatchObject({ position: 2 });
      expect(first.items[0]?.terms.startsOn).toEqual(Period.of(2026, 12));
      expect(first.items[0]?.terms.payout).toEqual(Money.of(1_200_000, 'PEN'));
      expect(first.items[0]?.joinedAt).toBeInstanceOf(Date);
      expect(first.nextCursor).toEqual(expect.any(String));

      const second = await list(ana, 'active', first.nextCursor);
      expect(second.items.map(({ circleId }) => circleId)).toEqual([lastMonth]);
      expect(second.nextCursor).toBeNull();

      const done = await list(ana, 'finished');
      expect(done).toEqual({
        items: [expect.objectContaining({ circleId: finished })],
        nextCursor: null,
      });
    });

    it('el cursor resiste uniones en el mismo instante (desempata por id)', async () => {
      const ana = await user();
      const ids = await Promise.all(
        Array.from({ length: 5 }, () => joinCircle(ana, Period.of(2027, 1))),
      );
      await dataSource.query(
        "UPDATE circle_memberships SET created_at = '2026-10-01T00:00:00.123456Z' WHERE user_id = $1",
        [ana],
      );

      const seen: string[] = [];
      let cursor: string | null = null;
      do {
        const page = await list(ana, 'active', cursor);
        seen.push(...page.items.map(({ circleId }) => circleId));
        cursor = page.nextCursor;
      } while (cursor);
      expect([...seen].sort()).toEqual([...ids].sort());
    });

    it('rechaza un cursor ajeno y devuelve vacío para un usuario que no es uuid', async () => {
      const forged = Buffer.from(JSON.stringify(['ayer', 'x'])).toString('base64url');
      for (const cursor of [forged, 'no-es-base64', Buffer.from('{}').toString('base64url')]) {
        await expect(list(randomUUID(), 'active', cursor)).rejects.toMatchObject({
          code: 'VALIDATION_ERROR',
          details: { cursor: 'invalid' },
        });
      }
      await expect(list('user-1', 'active')).resolves.toEqual({ items: [], nextCursor: null });
    });
  });
});
