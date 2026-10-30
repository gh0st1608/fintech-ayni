import { FakePaymentTokenizer } from '@/infrastructure/payments/FakePaymentTokenizer';
import { InMemoryCardRepository } from '@/infrastructure/payments/InMemoryCardRepository';
import { InMemoryPaymentRepository } from '@/infrastructure/payments/InMemoryPaymentRepository';
import { AppError } from '@/domain/shared/errors/AppError';
import type { CardDetails } from '@/domain/payments/CardDetails';

import {
  AddCardUseCase,
  ListCardsUseCase,
  PayInstallmentUseCase,
  RemoveCardUseCase,
  SetDefaultCardUseCase,
} from './cardUseCases';

const VISA: CardDetails = {
  number: '4509 9535 6623 3704',
  holderName: 'Ana Quispe',
  expirationMonth: 11,
  expirationYear: 2030,
  securityCode: '123',
  documentNumber: '45678912',
};

function setup() {
  const tokenizer = new FakePaymentTokenizer({ latencyMs: 0 });
  const cards = new InMemoryCardRepository({ latencyMs: 0 });
  const payments = new InMemoryPaymentRepository('PEN', { latencyMs: 0, withDuePayments: true });
  return { tokenizer, cards, payments };
}

describe('Casos de uso de tarjetas y pago de cuotas', () => {
  it('agrega una tarjeta con solo el token; la primera queda predeterminada', async () => {
    const { tokenizer, cards } = setup();
    const add = jest.spyOn(cards, 'add');
    const card = await new AddCardUseCase(tokenizer, cards).execute(VISA, 'key-1');
    expect(card).toMatchObject({ lastFour: '3704', isDefault: true, brand: 'visa' });
    const [token] = add.mock.calls[0]!;
    expect(token).not.toContain('4509');
    // Un reintento con la misma clave no guarda otra.
    await new AddCardUseCase(tokenizer, cards).execute(VISA, 'key-1');
    await expect(new ListCardsUseCase(cards).execute()).resolves.toHaveLength(1);
  });

  it('una tarjeta rechazada por la pasarela no se guarda', async () => {
    const { tokenizer, cards } = setup();
    await expect(
      new AddCardUseCase(tokenizer, cards).execute(
        { ...VISA, number: '4000 0000 0000 0002' },
        'key-2',
      ),
    ).rejects.toMatchObject({ code: 'CARD_REJECTED' });
    await expect(new ListCardsUseCase(cards).execute()).resolves.toEqual([]);
  });

  it('cambia la predeterminada y solo borra la predeterminada si es la única', async () => {
    const { tokenizer, cards } = setup();
    const add = new AddCardUseCase(tokenizer, cards);
    const first = await add.execute(VISA, 'k1');
    const second = await add.execute({ ...VISA, number: '5031 7557 3453 0604' }, 'k2');
    const listed = await new SetDefaultCardUseCase(cards).execute(second.id);
    expect(listed[0]).toMatchObject({ id: second.id, isDefault: true });

    const remove = new RemoveCardUseCase(cards);
    await expect(remove.execute(second.id)).rejects.toMatchObject({
      code: 'DEFAULT_CARD_REPLACEMENT_REQUIRED',
    });
    await remove.execute(first.id);
    await remove.execute(second.id);
    await expect(new ListCardsUseCase(cards).execute()).resolves.toEqual([]);
  });

  it('paga con Yape tokenizando el celular y el OTP, y con una tarjeta guardada', async () => {
    const { tokenizer, payments } = setup();
    const pay = jest.spyOn(payments, 'payInstallment');
    const useCase = new PayInstallmentUseCase(tokenizer, payments);
    await expect(
      useCase.execute('i-1', { method: 'yape', phoneNumber: '987654321', otp: '123456' }, 'k'),
    ).resolves.toMatchObject({ status: 'paid' });
    expect((pay.mock.calls[0] as unknown[])[1]).toEqual({
      method: 'yape',
      token: expect.any(String),
    });

    await useCase.execute('i-2', { method: 'card', cardId: 'card-1' }, 'k2');
    expect((pay.mock.calls[1] as unknown[])[1]).toEqual({ method: 'card', cardId: 'card-1' });
  });

  it('un OTP de Yape incorrecto se rechaza antes de cobrar', async () => {
    const { tokenizer, payments } = setup();
    const pay = jest.spyOn(payments, 'payInstallment');
    await expect(
      new PayInstallmentUseCase(tokenizer, payments).execute(
        'i-1',
        { method: 'yape', phoneNumber: '987654321', otp: '000000' },
        'k',
      ),
    ).rejects.toBeInstanceOf(AppError);
    expect(pay).not.toHaveBeenCalled();
  });
});
