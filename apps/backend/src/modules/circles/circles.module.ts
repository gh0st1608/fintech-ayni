import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { type AppConfigService } from '../../config/configuration';
import { CIRCLE_REPOSITORY } from './application/ports/circle-repository.port';
import { PayoutsModule } from '../payouts/payouts.module';
import { JOIN_CONFIG_REPOSITORY } from './application/ports/join-config-repository.port';
import { JOIN_ELIGIBILITY } from './application/ports/join-eligibility.port';
import {
  CIRCLE_ASSIGNMENT,
  type CircleAssignmentSettings,
  GetAvailableSlotsUseCase,
  SLOT_PRICING,
} from './application/use-cases/get-available-slots.use-case';
import { GetInstallmentOptionsUseCase } from './application/use-cases/get-installment-options.use-case';
import { GetJoinConfigUseCase } from './application/use-cases/get-join-config.use-case';
import { JoinCircleUseCase } from './application/use-cases/join-circle.use-case';
import { ListMyCirclesUseCase } from './application/use-cases/list-my-circles.use-case';
import { SlotPricing } from './domain/services/slot-pricing';
import { SlotPricingRules } from './domain/value-objects/slot-pricing-rules';
import { ProvisionalJoinEligibility } from './infrastructure/eligibility/provisional-join-eligibility';
import { ConfigJoinConfigRepository } from './infrastructure/persistence/config-join-config.repository';
import { CircleMembershipEntity } from './infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from './infrastructure/persistence/typeorm/circle.entity';
import { TypeOrmCircleRepository } from './infrastructure/persistence/typeorm/typeorm-circle.repository';
import { CirclesController } from './presentation/http/controllers/circles.controller';
import { MyCirclesController } from './presentation/http/controllers/my-circles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CircleEntity, CircleMembershipEntity]), PayoutsModule],
  controllers: [CirclesController, MyCirclesController],
  providers: [
    GetJoinConfigUseCase,
    GetInstallmentOptionsUseCase,
    GetAvailableSlotsUseCase,
    JoinCircleUseCase,
    ListMyCirclesUseCase,
    // Reglas provisionales de elegibilidad (KYC COPAYNI-47 y pending-scope R5).
    { provide: JOIN_ELIGIBILITY, useClass: ProvisionalJoinEligibility },
    ConfigJoinConfigRepository,
    { provide: JOIN_CONFIG_REPOSITORY, useExisting: ConfigJoinConfigRepository },
    TypeOrmCircleRepository,
    { provide: CIRCLE_REPOSITORY, useExisting: TypeOrmCircleRepository },
    {
      // Parámetros provisionales de precio (pending-scope R1 y R4), validados al arrancar.
      provide: SLOT_PRICING,
      inject: [ConfigService],
      useFactory: (config: AppConfigService) =>
        new SlotPricing(
          SlotPricingRules.create({
            fastestShareBps: config.get('SLOT_FASTEST_SHARE_BPS', { infer: true }),
            highestShareBps: config.get('SLOT_HIGHEST_SHARE_BPS', { infer: true }),
            maxFeeBps: config.get('SLOT_MAX_FEE_BPS', { infer: true }),
            maxDiscountBps: config.get('SLOT_MAX_DISCOUNT_BPS', { infer: true }),
            adminFeeBps: config.get('ADMIN_FEE_BPS', { infer: true }),
            adminFeeMode: config.get('ADMIN_FEE_MODE', { infer: true }),
          }),
        ),
    },
    {
      // Regla provisional de asignación de círculos (pending-scope R2).
      provide: CIRCLE_ASSIGNMENT,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): CircleAssignmentSettings => ({
        strategy: config.get('CIRCLE_ASSIGNMENT_STRATEGY', { infer: true }),
        startOffsetMonths: config.get('CIRCLE_START_OFFSET_MONTHS', { infer: true }),
        timeZone: config.get('BUSINESS_TIME_ZONE', { infer: true }),
      }),
    },
  ],
})
export class CirclesModule {}
