import { ApiProperty } from '@nestjs/swagger';

import { type Money } from '../../../../../shared/domain/value-objects/money';
import { type JoinConfigView } from '../../../application/use-cases/get-join-config.use-case';

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

export class CurrencyOptionResponse {
  @ApiProperty({ example: 'USD', description: 'Código ISO 4217' })
  code!: string;

  @ApiProperty({ description: 'true en la moneda oficial (PEN)' })
  official!: boolean;

  @ApiProperty({
    example: '3.75',
    description:
      'Unidades de la moneda oficial por unidad de esta (tipo de cambio fijo); 1 en la oficial',
  })
  rateToOfficial!: string;
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

  @ApiProperty({
    type: [CurrencyOptionResponse],
    description: "Monedas en las que se puede abrir un Game'ya; la oficial va primero",
  })
  currencies!: CurrencyOptionResponse[];

  @ApiProperty({
    example: '2026-11',
    description: 'Versión vigente de los términos del círculo; se envía al unirse (COPAYNI-86)',
  })
  termsVersion!: string;

  static from({ config, currencies }: JoinConfigView, termsVersion: string): JoinConfigResponse {
    const { payoutRange } = config;
    return {
      payout: {
        min: MoneyResponse.from(payoutRange.min),
        max: MoneyResponse.from(payoutRange.max),
        step: MoneyResponse.from(payoutRange.step),
      },
      userPayoutLimit: config.userPayoutLimit && MoneyResponse.from(config.userPayoutLimit),
      savingProgramMax: MoneyResponse.from(config.savingProgramMax),
      currencies,
      termsVersion,
    };
  }
}
