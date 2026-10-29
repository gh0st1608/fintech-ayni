import { Logger } from '@nestjs/common';

import { type GatewayCard } from '@src/modules/payments/application/ports/payment-gateway.port';
import {
  type SavedCard,
  type SavedCardRepositoryPort,
} from '@src/modules/payments/application/ports/saved-card-repository.port';
import {
  AddCardUseCase,
  ListCardsUseCase,
} from '@src/modules/payments/application/use-cases/add-card.use-case';
import { FakePaymentGateway } from '@src/modules/payments/infrastructure/fake-payment-gateway';
import { type UserRepositoryPort } from '@src/modules/users/application/ports/user-repository.port';
import { User } from '@src/modules/users/domain/entities/user';

/** Doble con la semántica del puerto: una tarjeta por (usuario, tarjeta de la pasarela). */
class InMemoryCards implements SavedCardRepositoryPort {
  readonly customers = new Map<string, string>();
  readonly cards: (SavedCard & { userId: string; key: string })[] = [];

  customerOf(userId: string) {
    return Promise.resolve(this.customers.get(userId) ?? null);
  }
  saveCustomer(userId: string, customerId: string) {
    this.customers.set(userId, customerId);
    return Promise.resolve();
  }
  findByIdempotencyKey(userId: string, key: string) {
    return Promise.resolve(this.cards.find((c) => c.userId === userId && c.key === key) ?? null);
  }
  add(userId: string, card: GatewayCard, key: string) {
    const existing = this.cards.find((c) => c.userId === userId && c.gatewayCardId === card.id);
    if (existing) return Promise.resolve(existing);
    const saved = {
      ...card,
      id: `sc-${this.cards.length + 1}`,
      gatewayCardId: card.id,
      isDefault: !this.cards.some((c) => c.userId === userId),
      createdAt: new Date(),
      userId,
      key,
    };
    this.cards.push(saved);
    return Promise.resolve(saved);
  }
  list(userId: string) {
    return Promise.resolve(this.cards.filter((c) => c.userId === userId));
  }
}

const user = (email: string | null) =>
  User.restore({
    id: 'u-1',
    email,
    phone: '+51999999999',
    status: 'active',
    preferredLanguage: null,
  });
const users = (found: User | null): UserRepositoryPort => ({
  findById: () => Promise.resolve(found),
  findOrRegister: jest.fn(),
  save: jest.fn(),
});

describe('AddCardUseCase (COPAYNI-40)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('crea el cliente una vez, guarda la tarjeta y la primera queda predeterminada', async () => {
    const gateway = new FakePaymentGateway();
    const ensure = jest.spyOn(gateway, 'ensureCustomer');
    const cards = new InMemoryCards();
    const useCase = new AddCardUseCase(gateway, cards, users(user('ana@mail.com')));
    const principal = { userId: 'u-1' };

    const first = await useCase.execute(principal, { token: 'tok-1', idempotencyKey: 'k-1' });
    const second = await useCase.execute(principal, { token: 'tok-2', idempotencyKey: 'k-2' });
    expect(first).toMatchObject({ created: true, card: { isDefault: true, lastFour: '4242' } });
    expect(second.card.isDefault).toBe(false);
    expect(ensure).toHaveBeenCalledTimes(1);
    await expect(new ListCardsUseCase(cards).execute(principal)).resolves.toHaveLength(2);
  });

  it('un reintento con la misma clave no vuelve a la pasarela', async () => {
    const gateway = new FakePaymentGateway();
    const cards = new InMemoryCards();
    const useCase = new AddCardUseCase(gateway, cards, users(user('ana@mail.com')));
    const first = await useCase.execute(
      { userId: 'u-1' },
      { token: 'tok-1', idempotencyKey: 'k-1' },
    );
    const save = jest.spyOn(gateway, 'saveCard');
    const retry = await useCase.execute(
      { userId: 'u-1' },
      { token: 'tok-1', idempotencyKey: 'k-1' },
    );
    expect(retry).toEqual({ card: first.card, created: false });
    expect(save).not.toHaveBeenCalled();
  });

  it('rechaza sin email, sin usuario o con una tarjeta rechazada', async () => {
    const cards = new InMemoryCards();
    const command = { token: 'tok-1', idempotencyKey: 'k-1' };
    await expect(
      new AddCardUseCase(new FakePaymentGateway(), cards, users(user(null))).execute(
        { userId: 'u-1' },
        command,
      ),
    ).rejects.toMatchObject({ code: 'EMAIL_REQUIRED' });
    await expect(
      new AddCardUseCase(new FakePaymentGateway(), cards, users(null)).execute(
        { userId: 'u-1' },
        command,
      ),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND' });
    await expect(
      new AddCardUseCase(new FakePaymentGateway(), cards, users(user('ana@mail.com'))).execute(
        { userId: 'u-1' },
        { token: 'rejected-1', idempotencyKey: 'k-2' },
      ),
    ).rejects.toMatchObject({ code: 'CARD_REJECTED' });
    expect(cards.cards).toEqual([]);
  });
});
