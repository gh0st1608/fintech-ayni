import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';

import { type AvailableSlotsResult } from '../../../application/use-cases/get-available-slots.use-case';
import { CADENCE_IDS, type CadenceId } from '../../../domain/value-objects/cadence';
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

  @ApiProperty({
    required: false,
    example: 'PEN',
    description:
      "Moneda del Game'ya (ISO 4217), una de join-config.currencies; la oficial si falta",
  })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;

  @ApiProperty({
    required: false,
    enum: CADENCE_IDS,
    description:
      'Frecuencia de los turnos (COPAYNI-116). La mensual si falta. Tiene que estar habilitada ' +
      'en el servidor y declarada por el cliente en x-ayni-cadences',
  })
  @IsOptional()
  @IsIn(CADENCE_IDS)
  cadence?: CadenceId;
}

export class SlotResponse {
  @ApiProperty({ example: 1, description: '1 = cobra el primer mes' })
  position!: number;

  @ApiProperty({ example: '2026-11', description: 'Mes de cobro (YYYY-MM)' })
  payoutPeriod!: string;

  @ApiProperty({
    example: '2026-11-04',
    description:
      'Día real de cobro de ese turno (YYYY-MM-DD). Es lo que se muestra al elegir: en una ' +
      'junta semanal cuatro turnos caen en el mismo mes (COPAYNI-116)',
  })
  payoutOn!: string;

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
    description: 'Retención del payout de cada turno, que paga sus últimas cuotas (COPAYNI-60)',
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

  @ApiProperty({
    example: '2026-11-01',
    description:
      'Fecha real del primer turno (YYYY-MM-DD). En cadencia mensual es el día 1 y coincide ' +
      'con startsOn; en las demás es el día que toca, y startsOn solo da su mes (COPAYNI-106).',
  })
  startsOnDate!: string;

  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty({ example: 10, deprecated: true, description: 'Alias de turns' })
  months!: number;

  @ApiProperty({ example: 10, description: 'Turnos de la junta, que son sus puestos y sus cuotas' })
  turns!: number;

  @ApiProperty({ enum: CADENCE_IDS, description: 'Frecuencia de los turnos' })
  cadence!: CadenceId;

  @ApiProperty({ example: 'Mes', description: 'Cómo se llama un turno: Mes, Quincena o Semana' })
  unit!: string;

  @ApiProperty({ example: '2027-08', description: 'Mes del último turno' })
  endsOn!: string;

  @ApiProperty({
    example: '2027-08-01',
    description:
      'Día real del último turno (YYYY-MM-DD): la fecha en que termina la junta. Es lo que se ' +
      'muestra, y no una duración en meses, que fuera de la mensual no cuadra (COPAYNI-116)',
  })
  endsOnDate!: string;

  @ApiProperty({
    example: 28,
    description: 'Días corridos que dura la junta, del primer vencimiento al último',
  })
  durationDays!: number;

  @ApiProperty({ type: [SlotResponse], description: 'Todos los slots, en orden de cobro' })
  slots!: SlotResponse[];

  static from({ circleId, terms, slots }: AvailableSlotsResult): SlotsResponse {
    const { endsOnDate } = terms;
    return {
      circleId,
      startsOn: terms.startsOnPeriod.toString(),
      startsOnDate: terms.startsOn.toString(),
      payout: MoneyResponse.from(terms.payout),
      months: terms.months,
      turns: terms.turns,
      cadence: terms.cadence.id,
      unit: terms.cadence.turnLabel(),
      endsOn: terms.endsOn.toString(),
      endsOnDate: endsOnDate.toString(),
      // Del primer vencimiento al último: 4 turnos semanales son 21 días de distancia entre el
      // primero y el cuarto, y la junta dura 28 contando el turno final.
      durationDays: terms.startsOn.daysUntil(endsOnDate) + terms.cadence.approximateTurnDays(),
      slots: slots.map((slot) => ({
        position: slot.position,
        payoutPeriod: slot.payoutPeriod.toString(),
        payoutOn: terms.payoutDateOf(slot.position).toString(),
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
