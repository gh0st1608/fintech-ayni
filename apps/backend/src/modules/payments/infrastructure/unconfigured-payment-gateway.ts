import {
  type GatewayCard,
  type GatewayPayment,
  type PaymentGatewayPort,
} from '../application/ports/payment-gateway.port';

/** Sin pasarela configurada (`PAYMENT_GATEWAY`): toda operación falla y lo dice. */
export class UnconfiguredPaymentGateway implements PaymentGatewayPort {
  ensureCustomer(): Promise<string> {
    return Promise.reject(UnconfiguredPaymentGateway.error());
  }

  saveCard(): Promise<GatewayCard> {
    return Promise.reject(UnconfiguredPaymentGateway.error());
  }

  deleteCard(): Promise<void> {
    return Promise.reject(UnconfiguredPaymentGateway.error());
  }

  charge(): Promise<GatewayPayment> {
    return Promise.reject(UnconfiguredPaymentGateway.error());
  }

  getPayment(): Promise<GatewayPayment> {
    return Promise.reject(UnconfiguredPaymentGateway.error());
  }

  private static error(): Error {
    return new Error('Sin pasarela de pago configurada (PAYMENT_GATEWAY; COPAYNI-34)');
  }
}
