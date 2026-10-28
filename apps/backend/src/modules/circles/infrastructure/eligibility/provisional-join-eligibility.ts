import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { type AppConfigService } from '../../../../config/configuration';
import { Money } from '../../../../shared/domain/value-objects/money';
import { GetSelectedPayoutMethodUseCase } from '../../../payouts/application/use-cases/payout-method.use-cases';
import { type JoinEligibilityPort } from '../../application/ports/join-eligibility.port';
import { type JoinApplicant } from '../../domain/services/join-eligibility';

/**
 * Elegibilidad para unirse con reglas provisionales y configurables:
 * - National ID: `JOIN_IDENTITY_CHECK`, hasta que el KYC (COPAYNI-47) guarde el estado real.
 * - Límite mensual de pay-in: `JOIN_MONTHLY_PAYIN_LIMIT`, igual para todos hasta definir R5.
 * - Método de cobro: el que el usuario eligió, si sigue disponible (COPAYNI-37).
 */
@Injectable()
export class ProvisionalJoinEligibility implements JoinEligibilityPort {
  private readonly identityVerified: boolean;
  private readonly monthlyPayInLimit: Money | null;

  constructor(
    @Inject(ConfigService) config: AppConfigService,
    @Inject(GetSelectedPayoutMethodUseCase)
    private readonly payoutMethods: GetSelectedPayoutMethodUseCase,
  ) {
    this.identityVerified =
      config.get('JOIN_IDENTITY_CHECK', { infer: true }) === 'assume_verified';
    const limit = config.get('JOIN_MONTHLY_PAYIN_LIMIT', { infer: true });
    this.monthlyPayInLimit =
      limit > 0 ? Money.of(limit, config.get('DEFAULT_CURRENCY', { infer: true })) : null;
  }

  async applicantFor(userId: string): Promise<JoinApplicant> {
    const method = await this.payoutMethods.execute(userId);
    return {
      identityVerified: this.identityVerified,
      monthlyPayInLimit: this.monthlyPayInLimit,
      payoutMethod: method ? { type: method.type, limit: method.limit } : null,
    };
  }
}
