import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import {
  ListSavingPlansUseCase,
  QuoteSavingPlanUseCase,
  SAVING_CATALOG,
  SAVING_SETTINGS,
  type SavingSettings,
} from './application/saving.use-cases';
import {
  CollectSavingContributionsUseCase,
  ListMySavingsUseCase,
  SAVING_SUBSCRIPTIONS,
  SubscribeToSavingPlanUseCase,
} from './application/subscription.use-cases';
import { parseCashback, parsePlans, SavingCatalog } from './domain/saving-catalog';
import { SqlSavingSubscriptions } from './infrastructure/sql-saving-subscriptions';
import { SavingsController } from './presentation/savings.controller';
import { SavingSubscriptionsController } from './presentation/subscriptions.http';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';

/**
 * Programa de ahorro con cashback (COPAYNI-32, 33 y 79). Catálogo y cashback provisionales desde
 * la configuración (R6, R12, M6), validados al arrancar. La suscripción cobra el primer aporte al
 * confirmar (D5) y la tarea diaria cobra los siguientes con débito automático.
 */
@Module({
  imports: [PaymentsModule, UsersModule],
  controllers: [SavingsController, SavingSubscriptionsController],
  providers: [
    ListSavingPlansUseCase,
    QuoteSavingPlanUseCase,
    SubscribeToSavingPlanUseCase,
    ListMySavingsUseCase,
    CollectSavingContributionsUseCase,
    { provide: SAVING_SUBSCRIPTIONS, useClass: SqlSavingSubscriptions },
    {
      provide: SAVING_CATALOG,
      inject: [ConfigService],
      useFactory: (config: AppConfigService) =>
        SavingCatalog.create({
          plans: parsePlans(
            config.get('SAVING_PLANS', { infer: true }),
            config.get('DEFAULT_CURRENCY', { infer: true }),
          ).filter(
            ({ target }) => target.amount <= config.get('SAVING_PROGRAM_MAX', { infer: true }),
          ),
          cashbackBps: parseCashback(config.get('SAVING_CASHBACK_BPS', { infer: true })),
        }),
    },
    {
      provide: SAVING_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): SavingSettings => ({
        timeZone: config.get('BUSINESS_TIME_ZONE', { infer: true }),
        // Supuesto aprobado en D5: el primer aporte se cobra al confirmar, en el mes actual.
        startOffsetMonths: 0,
      }),
    },
  ],
  exports: [CollectSavingContributionsUseCase],
})
export class SavingsModule {}
