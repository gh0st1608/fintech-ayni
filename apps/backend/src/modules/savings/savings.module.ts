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
import { parseCashback, parsePlans, SavingCatalog } from './domain/saving-catalog';
import { SavingsController } from './presentation/savings.controller';

/**
 * Programa de ahorro con cashback (COPAYNI-32 y 33). Catálogo y cashback provisionales desde la
 * configuración (R6, R12, M6), validados al arrancar. La suscripción espera el diseño (D5).
 */
@Module({
  controllers: [SavingsController],
  providers: [
    ListSavingPlansUseCase,
    QuoteSavingPlanUseCase,
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
        startOffsetMonths: config.get('CIRCLE_START_OFFSET_MONTHS', { infer: true }),
      }),
    },
  ],
})
export class SavingsModule {}
