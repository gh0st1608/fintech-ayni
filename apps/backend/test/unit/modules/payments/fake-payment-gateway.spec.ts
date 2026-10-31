import { CardRejectedError } from '@src/modules/payments/application/ports/payment-gateway.port';
import { FakePaymentGateway } from '@src/modules/payments/infrastructure/fake-payment-gateway';

describe('FakePaymentGateway', () => {
  it('conserva la marca, los últimos cuatro y el vencimiento del token falso de la app', async () => {
    const gateway = new FakePaymentGateway();
    await expect(gateway.saveCard('cus-1', 'fake-master-0604-3-2031')).resolves.toMatchObject({
      brand: 'master',
      lastFour: '0604',
      expirationMonth: 3,
      expirationYear: 2031,
    });
  });

  it('con otro token guarda una Visa de prueba y rechaza los "rejected…"', async () => {
    const gateway = new FakePaymentGateway();
    await expect(gateway.saveCard('cus-1', 'tok-123')).resolves.toMatchObject({
      brand: 'visa',
      lastFour: '4242',
    });
    await expect(gateway.saveCard('cus-1', 'rejected-1')).rejects.toBeInstanceOf(CardRejectedError);
  });
});
