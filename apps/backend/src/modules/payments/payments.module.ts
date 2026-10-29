import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port';
import { FakePaymentGateway } from './infrastructure/fake-payment-gateway';
import { MercadoPagoGateway } from './infrastructure/mercadopago/mercadopago-gateway';
import { UnconfiguredPaymentGateway } from './infrastructure/unconfigured-payment-gateway';

/**
 * Pasarela de pago (COPAYNI-34): Mercado Pago, con tarjetas guardadas y Yape. Exporta el puerto
 * para las tarjetas (COPAYNI-39 y 40) y el cobro de las cuotas.
 */
@Module({
  providers: [
    {
      provide: PAYMENT_GATEWAY,
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => {
        const gateway = config.get('PAYMENT_GATEWAY', { infer: true });
        if (gateway === 'fake') return new FakePaymentGateway();
        if (gateway === 'mercadopago') {
          return new MercadoPagoGateway({
            accessToken: config.get('MERCADOPAGO_ACCESS_TOKEN', { infer: true }),
            apiUrl: config.get('MERCADOPAGO_API_URL', { infer: true }),
            timeoutMs: config.get('MERCADOPAGO_TIMEOUT_MS', { infer: true }),
          });
        }
        return new UnconfiguredPaymentGateway();
      },
    },
  ],
  exports: [PAYMENT_GATEWAY],
})
export class PaymentsModule {}
