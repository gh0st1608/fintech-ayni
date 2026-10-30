import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../../../config/configuration';
import { KycPayInLimit } from '../../../documents/application/kyc-pay-in-limit';
import { KYC_STATUS, type KycStatusPort } from '../../../documents/application/ports';
import { GetSelectedPayoutMethodUseCase } from '../../../payouts/application/use-cases/payout-method.use-cases';
import { type JoinEligibilityPort } from '../../application/ports/join-eligibility.port';
import { type JoinApplicant } from '../../domain/services/join-eligibility';

/**
 * Elegibilidad para unirse con el estado del KYC (COPAYNI-47 y 48):
 * - National ID: aprobado en el KYC, o asumido con `JOIN_IDENTITY_CHECK=assume_verified`
 *   (desarrollo y pruebas, y production mientras no haya proveedor: COPAYNI-42).
 * - Límite mensual de pay-in: `KycPayInLimit` (R5 provisional).
 * - Ingreso declarado: hay un comprobante aprobado, o se asume con la misma variable.
 * - Método de cobro: el que el usuario eligió, si sigue disponible (COPAYNI-37).
 */
@Injectable()
export class ProvisionalJoinEligibility implements JoinEligibilityPort {
  private readonly assumeVerified: boolean;

  constructor(
    @Inject(ConfigService) config: AppConfigService,
    @Inject(GetSelectedPayoutMethodUseCase)
    private readonly payoutMethods: GetSelectedPayoutMethodUseCase,
    @Inject(KYC_STATUS) private readonly kyc: KycStatusPort,
    @Inject(KycPayInLimit) private readonly limits: KycPayInLimit,
  ) {
    this.assumeVerified = config.get('JOIN_IDENTITY_CHECK', { infer: true }) === 'assume_verified';
  }

  async applicantFor(userId: string): Promise<JoinApplicant> {
    const [method, verified, income, limit] = await Promise.all([
      this.payoutMethods.execute(userId),
      this.kyc.identityVerified(userId),
      this.kyc.approvedMonthlyIncome(userId),
      this.limits.monthlyLimitFor(userId),
    ]);
    return {
      identityVerified: this.assumeVerified || verified,
      monthlyPayInLimit: limit,
      incomeDeclared: this.assumeVerified || income !== null,
      payoutMethod: method ? { type: method.type, limit: method.limit } : null,
    };
  }
}
