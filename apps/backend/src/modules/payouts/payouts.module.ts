import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import {
  PAYOUT_METHOD_CATALOG,
  PAYOUT_METHOD_REPOSITORY,
  PAYOUT_SCHEDULE,
  PAYOUT_SETTINGS,
  type PayoutSettings,
} from './application/ports/payout.ports';
import {
  ListPayoutMethodsUseCase,
  SelectPayoutMethodUseCase,
} from './application/use-cases/payout-method.use-cases';
import { ConfigPayoutMethodCatalog } from './infrastructure/config-payout-method-catalog';
import {
  SqlPayoutMethodRepository,
  SqlPayoutSchedule,
} from './infrastructure/persistence/payout.adapters';
import { PayoutMethodController } from './presentation/http/controllers/payout-method.controller';

/** Métodos de cobro del payout (COPAYNI-37). Exporta el repositorio para la unión (COPAYNI-31). */
@Module({
  controllers: [PayoutMethodController],
  providers: [
    ListPayoutMethodsUseCase,
    SelectPayoutMethodUseCase,
    { provide: PAYOUT_METHOD_CATALOG, useClass: ConfigPayoutMethodCatalog },
    { provide: PAYOUT_METHOD_REPOSITORY, useClass: SqlPayoutMethodRepository },
    { provide: PAYOUT_SCHEDULE, useClass: SqlPayoutSchedule },
    {
      provide: PAYOUT_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): PayoutSettings => ({
        timeZone: config.get('BUSINESS_TIME_ZONE', { infer: true }),
      }),
    },
  ],
  exports: [PAYOUT_METHOD_REPOSITORY],
})
export class PayoutsModule {}
