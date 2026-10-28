import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Max, Min, ValidateIf } from 'class-validator';

import { type JoinCircleResult } from '../../../application/use-cases/join-circle.use-case';
import { SLOT_TYPES, type SlotType } from '../../../domain/services/slot-pricing';
import { MoneyResponse } from './join-config.response';

export class JoinCircleRequest {
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'circleId de slots; null abre el círculo nuevo que ofreció slots',
  })
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  circleId!: string | null;

  @ApiProperty({ example: 3000000, description: 'Payout elegido, en unidades menores' })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  payoutAmount!: number;

  @ApiProperty({ example: 10, description: 'Duración de installment-options' })
  @IsInt()
  @Min(2)
  @Max(120)
  months!: number;

  @ApiProperty({ example: 3, description: 'Slot elegido: 1 = cobra el primer mes' })
  @IsInt()
  @Min(1)
  @Max(120)
  position!: number;
}

/** Contrato `POST /v1/circles/join` (docs/api/circles.md). */
export class JoinCircleResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ example: '2026-12', description: 'Mes de inicio del círculo' })
  startsOn!: string;

  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty({ example: 10 })
  months!: number;

  @ApiProperty({ example: 3 })
  position!: number;

  @ApiProperty({ example: '2027-02', description: 'Mes de cobro (YYYY-MM)' })
  payoutPeriod!: string;

  @ApiProperty({ enum: SLOT_TYPES })
  type!: SlotType;

  @ApiProperty({ type: [MoneyResponse], description: 'Una cuota por mes del círculo, en orden' })
  installments!: MoneyResponse[];

  @ApiProperty({ type: MoneyResponse, description: 'Lo que recibe en su mes de cobro' })
  netPayout!: MoneyResponse;

  @ApiProperty({ description: 'false si es un reintento de una unión ya hecha (HTTP 200)' })
  created!: boolean;

  static from({ circleId, terms, quote, created }: JoinCircleResult): JoinCircleResponse {
    return {
      circleId,
      startsOn: terms.startsOn.toString(),
      payout: MoneyResponse.from(terms.payout),
      months: terms.months,
      position: quote.position,
      payoutPeriod: quote.payoutPeriod.toString(),
      type: quote.type,
      installments: quote.installments.map((installment) => MoneyResponse.from(installment)),
      netPayout: MoneyResponse.from(quote.netPayout),
      created,
    };
  }
}
