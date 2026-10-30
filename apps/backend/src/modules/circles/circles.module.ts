import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { type AppConfigService } from '../../config/configuration';
import { CIRCLE_CYCLE_REPOSITORY } from './application/ports/circle-cycle-repository.port';
import { CIRCLE_REPOSITORY } from './application/ports/circle-repository.port';
import { CONTRIBUTIONS, DISBURSEMENTS } from './application/ports/cycle-payments.port';
import { PayoutsModule } from '../payouts/payouts.module';
import { JOIN_CONFIG_REPOSITORY } from './application/ports/join-config-repository.port';
import { JOIN_ELIGIBILITY } from './application/ports/join-eligibility.port';
import { MEMBER_HISTORY } from './application/ports/member-history.port';
import { PAYMENTS_QUERY } from './application/ports/payments-query.port';
import { GetPaymentSummaryUseCase } from './application/use-cases/get-payment-summary.use-case';
import { ListTransactionsUseCase } from './application/use-cases/list-transactions.use-case';
import { GetPayoutEligibilityUseCase } from './application/use-cases/get-payout-eligibility.use-case';
import { PAYMENT_SETTINGS } from './application/ports/payment-settings.port';
import {
  GetPaymentSettingsUseCase,
  UpdatePaymentSettingsUseCase,
} from './application/use-cases/payment-settings.use-cases';
import { TypeOrmPaymentSettings } from './infrastructure/persistence/typeorm/typeorm-payment-settings.repository';
import { TypeOrmPaymentsQuery } from './infrastructure/persistence/typeorm/typeorm-payments-query';
import { MyPaymentsController } from './presentation/http/controllers/my-payments.controller';
import {
  InstallmentSettlement,
  PayInstallmentUseCase,
  ReconcilePaymentUseCase,
} from './application/use-cases/pay-installment.use-cases';
import {
  MercadoPagoWebhookController,
  WEBHOOK_SETTINGS,
  type WebhookSettings,
} from './presentation/http/controllers/mercadopago-webhook.controller';
import { SetCirclePauseUseCase } from './application/use-cases/set-circle-pause.use-case';
import { AdminCirclesController } from './presentation/http/controllers/admin-circles.controller';
import { STAFF_AUTHENTICATOR } from '../../shared/application/ports/staff-authenticator.port';
import { UnconfiguredStaffAuthenticator } from '../../shared/infrastructure/staff/unconfigured-staff-authenticator';
import {
  STAFF_ACCESS_SETTINGS,
  type StaffAccessSettings,
  StaffGuard,
} from '../../shared/presentation/guards/staff.guard';
import { TRUST_SETTINGS, type TrustSettings } from './application/use-cases/trust';
import { TypeOrmMemberHistory } from './infrastructure/persistence/typeorm/typeorm-member-history.repository';
import { MEMBER_DEBTS } from './application/ports/member-debts.port';
import { FUND_METRICS, GUARANTEE_FUND } from './application/ports/guarantee-fund.port';
import {
  CheckGuaranteeFundUseCase,
  GUARANTEE_FUND_SETTINGS,
  type GuaranteeFundSettings,
} from './application/use-cases/check-guarantee-fund.use-case';
import { RecordFundMovementUseCase } from './application/use-cases/record-fund-movement.use-case';
import { OtelFundMetrics } from './infrastructure/observability/otel-fund-metrics';
import { TypeOrmGuaranteeFund } from './infrastructure/persistence/typeorm/typeorm-guarantee-fund.repository';
import {
  CIRCLE_ASSIGNMENT,
  type CircleAssignmentSettings,
  GetAvailableSlotsUseCase,
  SLOT_PRICING,
} from './application/use-cases/get-available-slots.use-case';
import {
  AdvanceCircleCyclesUseCase,
  CIRCLE_CYCLE,
  type CircleCycleSettings,
} from './application/use-cases/advance-circle-cycles.use-case';
import { GetInstallmentOptionsUseCase } from './application/use-cases/get-installment-options.use-case';
import { GetJoinConfigUseCase } from './application/use-cases/get-join-config.use-case';
import { JoinCircleUseCase } from './application/use-cases/join-circle.use-case';
import { ListMyCirclesUseCase } from './application/use-cases/list-my-circles.use-case';
import { SettleMemberDebtUseCase } from './application/use-cases/settle-member-debt.use-case';
import {
  ListRecommendedCirclesUseCase,
  RECOMMENDATIONS,
  type RecommendationSettings,
} from './application/use-cases/list-recommended-circles.use-case';
import { SlotPricing } from './domain/services/slot-pricing';
import { SlotPricingRules } from './domain/value-objects/slot-pricing-rules';
import { DocumentsModule } from '../documents/documents.module';
import { ProvisionalJoinEligibility } from './infrastructure/eligibility/provisional-join-eligibility';
import {
  FakeCyclePayments,
  GatewayCyclePayments,
  UnconfiguredCyclePayments,
} from './infrastructure/payments/cycle-payments';
import { PaymentsModule } from '../payments/payments.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { ReferralDiscounts } from './application/use-cases/referral-discounts';
import { CollectInstallmentUseCase } from '../payments/application/use-cases/collect-installment.use-case';
import { ConfigJoinConfigRepository } from './infrastructure/persistence/config-join-config.repository';
import { CircleMembershipEntity } from './infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from './infrastructure/persistence/typeorm/circle.entity';
import { TypeOrmCircleCycleRepository } from './infrastructure/persistence/typeorm/typeorm-circle-cycle.repository';
import { TypeOrmCircleRepository } from './infrastructure/persistence/typeorm/typeorm-circle.repository';
import { TypeOrmMemberDebts } from './infrastructure/persistence/typeorm/typeorm-member-debts.repository';
import { CirclesController } from './presentation/http/controllers/circles.controller';
import { MyCirclesController } from './presentation/http/controllers/my-circles.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CircleEntity, CircleMembershipEntity]),
    PayoutsModule,
    PaymentsModule,
    ReferralsModule,
    DocumentsModule,
  ],
  controllers: [
    CirclesController,
    MyCirclesController,
    MyPaymentsController,
    MercadoPagoWebhookController,
    AdminCirclesController,
  ],
  providers: [
    GetJoinConfigUseCase,
    GetInstallmentOptionsUseCase,
    GetAvailableSlotsUseCase,
    JoinCircleUseCase,
    ListMyCirclesUseCase,
    ListRecommendedCirclesUseCase,
    // Ciclo mensual (COPAYNI-56): lo ejecuta la tarea programada dist/jobs/circle-cycle.js.
    AdvanceCircleCyclesUseCase,
    TypeOrmCircleCycleRepository,
    { provide: CIRCLE_CYCLE_REPOSITORY, useExisting: TypeOrmCircleCycleRepository },
    {
      provide: CIRCLE_CYCLE,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): CircleCycleSettings => ({
        dueDay: config.get('CIRCLE_INSTALLMENT_DUE_DAY', { infer: true }),
        timeZone: config.get('BUSINESS_TIME_ZONE', { infer: true }),
        // Reglas de impago del PO con valores de R18 (pending-scope §3.1), parametrizables.
        delinquency: {
          graceDays: config.get('DELINQUENCY_GRACE_DAYS', { infer: true }),
          lateFeeBps: config.get('LATE_FEE_BPS', { infer: true }),
          refundPenaltyBps: config.get('EXPULSION_REFUND_PENALTY_BPS', { infer: true }),
        },
        fundFeeShareBps: config.get('GUARANTEE_FUND_FEE_SHARE_BPS', { infer: true }),
      }),
    },
    // Fondo de garantía (COPAYNI-58, R16): alerta de saldo y movimientos manuales del back-office.
    CheckGuaranteeFundUseCase,
    RecordFundMovementUseCase,
    TypeOrmGuaranteeFund,
    { provide: GUARANTEE_FUND, useExisting: TypeOrmGuaranteeFund },
    { provide: FUND_METRICS, useClass: OtelFundMetrics },
    {
      provide: GUARANTEE_FUND_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): GuaranteeFundSettings => ({
        minInstallmentsPerCircle: config.get('GUARANTEE_FUND_MIN_INSTALLMENTS_PER_CIRCLE', {
          infer: true,
        }),
      }),
    },
    // Deudas por impago (COPAYNI-57): bloquean la unión hasta saldarse.
    SettleMemberDebtUseCase,
    TypeOrmMemberDebts,
    { provide: MEMBER_DEBTS, useExisting: TypeOrmMemberDebts },
    {
      // Pasarela pendiente (D1, COPAYNI-34): solo pagos simulados o ninguno.
      provide: CONTRIBUTIONS,
      inject: [ConfigService, CollectInstallmentUseCase, ReferralDiscounts],
      useFactory: (
        config: AppConfigService,
        collect: CollectInstallmentUseCase,
        discounts: ReferralDiscounts,
      ) => {
        const adapter = config.get('CIRCLE_PAYMENTS_ADAPTER', { infer: true });
        if (adapter === 'fake') return new FakeCyclePayments();
        if (adapter === 'gateway') return new GatewayCyclePayments(collect, discounts);
        return new UnconfiguredCyclePayments();
      },
    },
    { provide: DISBURSEMENTS, useExisting: CONTRIBUTIONS },
    {
      // Criterio provisional de recomendación (COPAYNI-25).
      provide: RECOMMENDATIONS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): RecommendationSettings => ({
        limit: config.get('RECOMMENDED_CIRCLES_LIMIT', { infer: true }),
      }),
    },
    // Pago de la cuota desde la app y webhooks de Mercado Pago (COPAYNI-63).
    InstallmentSettlement,
    ReferralDiscounts,
    PayInstallmentUseCase,
    ReconcilePaymentUseCase,
    {
      provide: WEBHOOK_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): WebhookSettings => ({
        secret: config.get('MERCADOPAGO_WEBHOOK_SECRET', { infer: true }) ?? null,
      }),
    },
    // Sección Payment de la app (COPAYNI-35).
    GetPaymentSummaryUseCase,
    ListTransactionsUseCase,
    GetPayoutEligibilityUseCase,
    GetPaymentSettingsUseCase,
    UpdatePaymentSettingsUseCase,
    TypeOrmPaymentSettings,
    { provide: PAYMENT_SETTINGS, useExisting: TypeOrmPaymentSettings },
    TypeOrmPaymentsQuery,
    { provide: PAYMENTS_QUERY, useExisting: TypeOrmPaymentsQuery },
    // Pausa del admin general (COPAYNI-61). La identidad del personal llega con la fase 1 del
    // back-office: hasta entonces, la API de administración rechaza todo con 401.
    SetCirclePauseUseCase,
    StaffGuard,
    { provide: STAFF_AUTHENTICATOR, useClass: UnconfiguredStaffAuthenticator },
    {
      provide: STAFF_ACCESS_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): StaffAccessSettings => ({
        stepUpMaxAgeSeconds: config.get('STAFF_STEP_UP_MAX_AGE_SECONDS', { infer: true }),
      }),
    },
    // Regla de confianza por tipo de turno (COPAYNI-60, valores propuestos de R18).
    TypeOrmMemberHistory,
    { provide: MEMBER_HISTORY, useExisting: TypeOrmMemberHistory },
    {
      provide: TRUST_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: AppConfigService): TrustSettings => ({
        fastestMinCompletedCircles: config.get('TRUST_FASTEST_MIN_COMPLETED_CIRCLES', {
          infer: true,
        }),
      }),
    },
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
            retentionInstallments: config.get('PAYOUT_RETENTION_INSTALLMENTS', { infer: true }),
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
