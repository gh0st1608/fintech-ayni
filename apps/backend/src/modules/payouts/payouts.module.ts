import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import {
  FIELD_CIPHER,
  type FieldCipherPort,
} from '../../shared/application/ports/field-cipher.port';
import { AesGcmFieldCipher } from '../../shared/infrastructure/crypto/aes-gcm-field-cipher';
import {
  PAYOUT_ACCOUNT_OWNERS,
  PAYOUT_ACCOUNTS,
  PAYOUT_METHOD_CATALOG,
  PAYOUT_METHOD_REPOSITORY,
  PAYOUT_SCHEDULE,
  PAYOUT_SETTINGS,
  type PayoutSettings,
} from './application/ports/payout.ports';
import {
  GetAdminPayoutAccountsUseCase,
  GetPayoutAccountUseCase,
  RegisterPayoutAccountUseCase,
} from './application/use-cases/payout-account.use-cases';
import {
  GetSelectedPayoutMethodUseCase,
  ListPayoutMethodsUseCase,
  SelectPayoutMethodUseCase,
} from './application/use-cases/payout-method.use-cases';
import { ConfigPayoutMethodCatalog } from './infrastructure/config-payout-method-catalog';
import {
  SqlPayoutMethodRepository,
  SqlPayoutSchedule,
} from './infrastructure/persistence/payout.adapters';
import {
  SqlPayoutAccountOwners,
  SqlPayoutAccountRepository,
} from './infrastructure/persistence/sql-payout-accounts';
import { AdminPayoutAccountController } from './presentation/http/controllers/admin-payout-account.controller';
import { PayoutAccountController } from './presentation/http/controllers/payout-account.controller';
import { PayoutMethodController } from './presentation/http/controllers/payout-method.controller';

/**
 * Métodos de cobro del payout (COPAYNI-37) y la cuenta donde se cobra, que registra el personal
 * (COPAYNI-81). Exporta el método elegido para la unión (COPAYNI-31).
 */
@Module({
  controllers: [PayoutMethodController, PayoutAccountController, AdminPayoutAccountController],
  providers: [
    GetPayoutAccountUseCase,
    GetAdminPayoutAccountsUseCase,
    RegisterPayoutAccountUseCase,
    { provide: PAYOUT_ACCOUNTS, useClass: SqlPayoutAccountRepository },
    { provide: PAYOUT_ACCOUNT_OWNERS, useClass: SqlPayoutAccountOwners },
    {
      provide: FIELD_CIPHER,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): FieldCipherPort => {
        const key = config.get('FIELD_ENCRYPTION_KEY', { infer: true });
        if (key) return AesGcmFieldCipher.fromBase64(key);
        new Logger('Payouts').warn('FIELD_ENCRYPTION_KEY sin valor: clave de desarrollo');
        return AesGcmFieldCipher.forDevelopment('ayni-dev-field-encryption');
      },
    },
    ListPayoutMethodsUseCase,
    SelectPayoutMethodUseCase,
    GetSelectedPayoutMethodUseCase,
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
  exports: [GetSelectedPayoutMethodUseCase],
})
export class PayoutsModule {}
