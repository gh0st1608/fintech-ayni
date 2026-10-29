import { ApiProperty } from '@nestjs/swagger';

import {
  type PayoutEligibility,
  PAYOUT_REQUIREMENTS,
  type PayoutRequirement,
  type RequirementStatus,
} from '../../../application/use-cases/get-payout-eligibility.use-case';

export class PayoutRequirementResponse {
  @ApiProperty({ enum: PAYOUT_REQUIREMENTS })
  requirement!: PayoutRequirement;

  @ApiProperty({
    enum: ['met', 'pending', 'unavailable'],
    description: 'unavailable: falta, pero la app todavía no permite resolverlo',
  })
  status!: RequirementStatus;
}

/** Contrato de `GET /v1/me/payout-eligibility` (docs/api/payments.md). */
export class PayoutEligibilityResponse {
  @ApiProperty({ description: 'true si cumple todos los requisitos' })
  isEligible!: boolean;

  @ApiProperty({ type: [PayoutRequirementResponse], description: 'En el orden del checklist' })
  requirements!: PayoutRequirementResponse[];

  static from({ isEligible, requirements }: PayoutEligibility): PayoutEligibilityResponse {
    return { isEligible, requirements: requirements.map((item) => ({ ...item })) };
  }
}
