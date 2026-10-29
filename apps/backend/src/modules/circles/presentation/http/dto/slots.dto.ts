import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { type AvailableSlotsResult } from '../../../application/use-cases/get-available-slots.use-case';
import { catchUpTotal, SLOT_TYPES, type SlotType } from '../../../domain/services/slot-pricing';
import { SLOT_RESTRICTIONS, type SlotRestriction } from '../../../domain/services/trust-policy';
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

  @ApiProperty({
    required: false,
    format: 'uuid',
    description: 'Un círculo recomendado (COPAYNI-59): sus slots en vez del círculo asignado',
  })
  @IsOptional()
  @IsUUID()
  circleId?: string;
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

  @ApiProperty({
    type: MoneyResponse,
    description: 'Puesta al día de una vacante en un círculo en curso (COPAYNI-59); si no, cero',
  })
  catchUp!: MoneyResponse;

  @ApiProperty({
    type: MoneyResponse,
    description:
      'Retención del payout en los turnos de la primera mitad, que paga sus últimas cuotas (COPAYNI-60)',
  })
  retention!: MoneyResponse;

  @ApiProperty({ description: 'false si la regla de confianza no le permite este tipo de turno' })
  allowed!: boolean;

  @ApiProperty({
    enum: SLOT_RESTRICTIONS,
    nullable: true,
    type: String,
    description: 'Por qué no se permite (COPAYNI-60); null si se permite',
  })
  notAllowedReason!: SlotRestriction | null;

  @ApiProperty({
    description:
      'false si otro miembro ya ocupa el slot; en un círculo en curso, true solo en sus vacantes abiertas',
  })
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
      slots: slots.map((slot) => ({
        position: slot.position,
        payoutPeriod: slot.payoutPeriod.toString(),
        type: slot.type,
        fee: MoneyResponse.from(slot.fee),
        discount: MoneyResponse.from(slot.discount),
        catchUp: MoneyResponse.from(catchUpTotal(slot)),
        retention: MoneyResponse.from(slot.retention),
        available: slot.available,
        allowed: slot.restriction === null,
        notAllowedReason: slot.restriction,
      })),
    };
  }
}
