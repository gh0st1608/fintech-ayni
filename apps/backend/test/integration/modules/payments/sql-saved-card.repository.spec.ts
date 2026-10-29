import { type DataSource } from 'typeorm';

import { SqlSavedCardRepository } from '@src/modules/payments/infrastructure/persistence/sql-saved-card.repository';
import { insertTestUser, openTestDatabase } from '@test/support/test-database';

const card = (id: string) => ({
  id,
  brand: 'visa',
  lastFour: '0215',
  expirationMonth: 11,
  expirationYear: 2029,
});

/** Tarjetas guardadas contra PostgreSQL (COPAYNI-40). */
describe('SqlSavedCardRepository', () => {
  let dataSource: DataSource;
  let cards: SqlSavedCardRepository;

  beforeAll(async () => {
    dataSource = await openTestDatabase([]);
    cards = new SqlSavedCardRepository(dataSource);
  });

  afterAll(() => dataSource.destroy());

  it('guarda el cliente una vez y sus tarjetas, con una sola predeterminada', async () => {
    const userId = await insertTestUser(dataSource);
    await expect(cards.customerOf(userId)).resolves.toBeNull();
    await cards.saveCustomer(userId, `cus-${userId}`);
    await cards.saveCustomer(userId, 'otro');
    await expect(cards.customerOf(userId)).resolves.toBe(`cus-${userId}`);

    // Dos altas a la vez: solo una queda predeterminada.
    const [first, second] = await Promise.all([
      cards.add(userId, card(`c1-${userId}`), 'k-1'),
      cards.add(userId, card(`c2-${userId}`), 'k-2'),
    ]);
    expect([first.isDefault, second.isDefault].filter(Boolean)).toHaveLength(1);
    // La misma tarjeta de la pasarela no se duplica.
    await expect(cards.add(userId, card(`c1-${userId}`), 'k-3')).resolves.toEqual(first);
    await expect(cards.findByIdempotencyKey(userId, 'k-2')).resolves.toEqual(second);
    await expect(cards.findByIdempotencyKey(userId, 'k-9')).resolves.toBeNull();

    const list = await cards.list(userId);
    expect(list).toHaveLength(2);
    expect(list[0]!.isDefault).toBe(true);
    await expect(cards.list('no-es-uuid')).resolves.toEqual([]);
    await expect(cards.customerOf('no-es-uuid')).resolves.toBeNull();
    await expect(cards.findByIdempotencyKey('no-es-uuid', 'k')).resolves.toBeNull();
  });
});
