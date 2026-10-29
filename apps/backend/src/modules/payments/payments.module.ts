import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import { UsersModule } from '../users/users.module';
import { PAYMENT_GATEWAY } from './application/ports/payment-gateway.port';
import { SAVED_CARDS } from './application/ports/saved-card-repository.port';
import { AddCardUseCase, ListCardsUseCase } from './application/use-cases/add-card.use-case';
import {
  AUTO_DEBIT_SETTINGS,
  type AutoDebitSettings,
  CollectInstallmentUseCase,
} from './application/use-cases/collect-installment.use-case';
import { FakePaymentGateway } from './infrastructure/fake-payment-gateway';
import { MercadoPagoGateway } from './infrastructure/mercadopago/mercadopago-gateway';
import { SqlSavedCardRepository } from './infrastructure/persistence/sql-saved-card.repository';
import { UnconfiguredPaymentGateway } from './infrastructure/unconfigured-payment-gateway';
import { CardsController } from './presentation/http/controllers/cards.controller';

/**
 * Pasarela de pago (COPAYNI-34): Mercado Pago, con tarjetas guardadas y Yape. Exporta el puerto
 * para las tarjetas (COPAYNI-39 y 40) y el cobro de las cuotas.
 */
@Module({
  imports: [UsersModule],
  controllers: [CardsController],
  providers: [
    AddCardUseCase,
    ListCardsUseCase,
    CollectInstallmentUseCase,
    {
      provide: AUTO_DEBIT_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): AutoDebitSettings => ({
        timeZone: config.get('BUSINESS_TIME_ZONE', { infer: true }),
      }),
    },
    SqlSavedCardRepository,
    { provide: SAVED_CARDS, useExisting: SqlSavedCardRepository },
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
  exports: [PAYMENT_GATEWAY, SAVED_CARDS, CollectInstallmentUseCase],
})
export class PaymentsModule {}
