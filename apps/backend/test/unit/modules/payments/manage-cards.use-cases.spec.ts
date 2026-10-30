import { Logger } from '@nestjs/common';

import { AddCardUseCase } from '@src/modules/payments/application/use-cases/add-card.use-case';
import {
  RemoveCardUseCase,
  SetDefaultCardUseCase,
} from '@src/modules/payments/application/use-cases/manage-cards.use-cases';
import { FakePaymentGateway } from '@src/modules/payments/infrastructure/fake-payment-gateway';
import { User } from '@src/modules/users/domain/entities/user';
import { InMemoryCards } from '@test/support/in-memory-cards';

const PRINCIPAL = { userId: 'u-1' };

async function withCards(count: number) {
  const gateway = new FakePaymentGateway();
  const cards = new InMemoryCards();
  const user = User.restore({
    id: 'u-1',
    email: 'ana@mail.com',
    phone: null,
    status: 'active',
    preferredLanguage: null,
  });
  const add = new AddCardUseCase(gateway, cards, {
    findById: () => Promise.resolve(user),
    findOrRegister: jest.fn(),
    findByIdentifier: jest.fn(),
    save: jest.fn(),
  });
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    ids.push(
      (await add.execute(PRINCIPAL, { token: `tok-${index}`, idempotencyKey: `k-${index}` })).card
        .id,
    );
  }
  return { gateway, cards, ids };
}

describe('Gestionar tarjetas (COPAYNI-39)', () => {
  beforeEach(() => jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());

  it('cambia la predeterminada y rechaza una tarjeta ajena', async () => {
    const { cards, ids } = await withCards(2);
    const list = await new SetDefaultCardUseCase(cards).execute(PRINCIPAL, ids[1]!);
    expect(list.filter(({ isDefault }) => isDefault).map(({ id }) => id)).toEqual([ids[1]]);
    await expect(new SetDefaultCardUseCase(cards).execute(PRINCIPAL, 'otra')).rejects.toMatchObject(
      {
        code: 'CARD_NOT_FOUND',
      },
    );
  });

  it('borra una tarjeta en la pasarela y aquí; la predeterminada con otras pide elegir otra', async () => {
    const { gateway, cards, ids } = await withCards(2);
    const remove = new RemoveCardUseCase(cards, gateway);
    const deleteCard = jest.spyOn(gateway, 'deleteCard');

    await expect(remove.execute(PRINCIPAL, ids[0]!)).rejects.toMatchObject({
      code: 'DEFAULT_CARD_REPLACEMENT_REQUIRED',
    });
    await remove.execute(PRINCIPAL, ids[1]!);
    expect(deleteCard).toHaveBeenCalledWith(expect.stringMatching(/^cus-/), 'card-tok-1');
    // Ahora es la única: se puede borrar aunque sea la predeterminada.
    await remove.execute(PRINCIPAL, ids[0]!);
    await expect(cards.list('u-1')).resolves.toEqual([]);
    await expect(remove.execute(PRINCIPAL, ids[0]!)).rejects.toMatchObject({
      code: 'CARD_NOT_FOUND',
    });
  });
});
