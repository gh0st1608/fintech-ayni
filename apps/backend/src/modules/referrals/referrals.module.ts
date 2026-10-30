import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../config/configuration';
import { Money } from '../../shared/domain/value-objects/money';
import {
  REFERRAL_SETTINGS,
  REFERRALS,
  type ReferralSettings,
} from './application/ports/referral-repository.port';
import {
  ClaimReferralUseCase,
  GetMyReferralUseCase,
  GetReferralSummaryUseCase,
} from './application/use-cases/referral.use-cases';
import { SqlReferralRepository } from './infrastructure/sql-referral.repository';
import { ReferralsController } from './presentation/referrals.controller';

/** Referidos e invitaciones (COPAYNI-51 a 53), con las reglas provisionales de R7. */
@Module({
  controllers: [ReferralsController],
  providers: [
    GetMyReferralUseCase,
    ClaimReferralUseCase,
    GetReferralSummaryUseCase,
    SqlReferralRepository,
    { provide: REFERRALS, useExisting: SqlReferralRepository },
    {
      provide: REFERRAL_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): ReferralSettings => ({
        reward: Money.of(
          config.get('REFERRAL_REWARD_AMOUNT', { infer: true }),
          config.get('DEFAULT_CURRENCY', { infer: true }),
        ),
        maxRewardedInvites: config.get('REFERRAL_MAX_REWARDED_INVITES', { infer: true }),
        linkBaseUrl: config.get('REFERRAL_LINK_BASE_URL', { infer: true }),
      }),
    },
  ],
  exports: [REFERRALS, REFERRAL_SETTINGS],
})
export class ReferralsModule {}
