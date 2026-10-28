import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { type InstallmentOptionsResult } from '../../../application/use-cases/get-installment-options.use-case';
import { MoneyResponse } from './join-config.response';

export class InstallmentOptionsQuery {
  @ApiProperty({ example: 3000000, description: 'Payout elegido, en unidades menores' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  payoutAmount!: number;
}

export class InstallmentOptionResponse {
  @ApiProperty({ example: 12 })
  months!: number;

  @ApiProperty({
    type: MoneyResponse,
    description: 'Cuota base (payout / meses); la del slot elegido puede variar',
  })
  installment!: MoneyResponse;
}

/** Contrato `GET /v1/circles/installment-options` (docs/api/circles.md). */
export class InstallmentOptionsResponse {
  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty({ type: [InstallmentOptionResponse], description: 'De menor a mayor duración' })
  options!: InstallmentOptionResponse[];

  static from({ payout, options }: InstallmentOptionsResult): InstallmentOptionsResponse {
    return {
      payout: MoneyResponse.from(payout),
      options: options.map(({ months, installment }) => ({
        months,
        installment: MoneyResponse.from(installment),
      })),
    };
  }
}
