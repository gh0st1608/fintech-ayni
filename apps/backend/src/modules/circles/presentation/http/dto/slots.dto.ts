import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { type AvailableSlotsResult } from '../../../application/use-cases/get-available-slots.use-case';
import { SLOT_TYPES, type SlotType } from '../../../domain/services/slot-pricing';
import { MoneyResponse } from './join-config.response';

export class SlotsQuery {
  @ApiProperty({ example: 3000000, description: 'Payout elegido, en unidades menores' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  payoutAmount!: number;

  @ApiProperty({ example: 10, description: 'Duración de installment-options' })
  @Type(() => Number)
  @IsInt()
  @Min(2)
  @Max(120)
  months!: number;
}

export class SlotResponse {
  @ApiProperty({ example: 1, description: '1 = cobra el primer mes' })
  position!: number;

  @ApiProperty({ example: '2026-11', description: 'Mes de cobro (YYYY-MM)' })
  payoutPeriod!: string;

  @ApiProperty({ enum: SLOT_TYPES })
  type!: SlotType;

  @ApiProperty({ type: MoneyResponse, description: 'Cero salvo en fastest_payout' })
  fee!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Cero salvo en highest_return' })
  discount!: MoneyResponse;

  @ApiProperty({ description: 'false si otro miembro ya ocupa el slot' })
  available!: boolean;
}

/** Contrato `GET /v1/circles/slots` (docs/api/circles.md). */
export class SlotsResponse {
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Círculo ofrecido; null si es uno nuevo, que se crea al unirse',
  })
  circleId!: string | null;

  @ApiProperty({ example: '2026-11', description: 'Mes de inicio del círculo' })
  startsOn!: string;

  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty({ example: 10 })
  months!: number;

  @ApiProperty({ type: [SlotResponse], description: 'Todos los slots, en orden de cobro' })
  slots!: SlotResponse[];

  static from({ circleId, terms, slots }: AvailableSlotsResult): SlotsResponse {
    return {
      circleId,
      startsOn: terms.startsOn.toString(),
      payout: MoneyResponse.from(terms.payout),
      months: terms.months,
      slots: slots.map(({ position, payoutPeriod, type, fee, discount, available }) => ({
        position,
        payoutPeriod: payoutPeriod.toString(),
        type,
        fee: MoneyResponse.from(fee),
        discount: MoneyResponse.from(discount),
        available,
      })),
    };
  }
}
