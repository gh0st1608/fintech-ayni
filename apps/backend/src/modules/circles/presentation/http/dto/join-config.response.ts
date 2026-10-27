import { ApiProperty } from '@nestjs/swagger';

import { type Money } from '../../../../../shared/domain/value-objects/money';
import { type JoinConfig } from '../../../domain/entities/join-config';

export class MoneyResponse {
  @ApiProperty({ example: 300000, description: 'Entero en unidades menores (céntimos)' })
  amount!: number;

  @ApiProperty({ example: 'PEN', description: 'Código ISO 4217' })
  currency!: string;

  static from(money: Money): MoneyResponse {
    return { amount: money.amount, currency: money.currency };
  }
}

export class PayoutRangeResponse {
  @ApiProperty({ type: MoneyResponse })
  min!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse })
  max!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Salto del slider, contado desde min' })
  step!: MoneyResponse;
}

/** Contrato `GET /v1/circles/join-config` (docs/api/circles.md). */
export class JoinConfigResponse {
  @ApiProperty({ type: PayoutRangeResponse })
  payout!: PayoutRangeResponse;

  @ApiProperty({
    type: MoneyResponse,
    nullable: true,
    description: 'Payout máximo según el límite del usuario; null si no lo restringe',
  })
  userPayoutLimit!: MoneyResponse | null;

  @ApiProperty({ type: MoneyResponse })
  savingProgramMax!: MoneyResponse;

  static from(config: JoinConfig): JoinConfigResponse {
    const { payoutRange } = config;
    return {
      payout: {
        min: MoneyResponse.from(payoutRange.min),
        max: MoneyResponse.from(payoutRange.max),
        step: MoneyResponse.from(payoutRange.step),
      },
      userPayoutLimit: config.userPayoutLimit && MoneyResponse.from(config.userPayoutLimit),
      savingProgramMax: MoneyResponse.from(config.savingProgramMax),
    };
  }
}
