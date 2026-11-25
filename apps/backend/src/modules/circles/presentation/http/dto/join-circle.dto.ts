import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

import { type JoinCircleResult } from '../../../application/use-cases/join-circle.use-case';
import { catchUpTotal, SLOT_TYPES, type SlotType } from '../../../domain/services/slot-pricing';
import { CADENCE_IDS, type CadenceId } from '../../../domain/value-objects/cadence';
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

  @ApiProperty({
    example: 10,
    description: 'Turnos: una de las duraciones que ofreció installment-options',
  })
  @IsInt()
  @Min(2)
  @Max(120)
  months!: number;

  @ApiProperty({
    required: false,
    enum: CADENCE_IDS,
    description:
      'Frecuencia de los turnos (COPAYNI-116), la misma que se pidió en slots. La mensual si ' +
      'falta. Tiene que estar habilitada en el servidor y declarada en x-ayni-cadences',
  })
  @IsOptional()
  @IsIn(CADENCE_IDS)
  cadence?: CadenceId;

  @ApiProperty({ example: 3, description: 'Slot elegido: 1 = cobra el primer mes' })
  @IsInt()
  @Min(1)
  @Max(120)
  position!: number;

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
    example: '2026-11',
    description:
      'Versión de los términos aceptada en la confirmación (termsVersion de join-config)',
  })
  @IsString()
  @Matches(/^[\w.-]{1,32}$/)
  termsVersion!: string;
}

/** Contrato `POST /v1/circles/join` (docs/api/circles.md). */
export class JoinCircleResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ example: '2026-12', description: 'Mes de inicio del círculo' })
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

  @ApiProperty({ example: 10, description: 'Turnos de la junta' })
  turns!: number;

  @ApiProperty({ enum: CADENCE_IDS })
  cadence!: CadenceId;

  @ApiProperty({ example: '2026-11-25', description: 'Día real del último turno' })
  endsOnDate!: string;

  @ApiProperty({ example: 3 })
  position!: number;

  @ApiProperty({ example: '2027-02', description: 'Mes de cobro (YYYY-MM)' })
  payoutPeriod!: string;

  @ApiProperty({ enum: SLOT_TYPES })
  type!: SlotType;

  @ApiProperty({ type: [MoneyResponse], description: 'Una cuota por mes del círculo, en orden' })
  installments!: MoneyResponse[];

  @ApiProperty({
    type: MoneyResponse,
    description: 'Lo que recibe en su mes de cobro, sin la retención',
  })
  netPayout!: MoneyResponse;

  @ApiProperty({
    type: MoneyResponse,
    description:
      'Retención del payout que paga sus últimas cuotas (COPAYNI-60); cero en el último turno',
  })
  retention!: MoneyResponse;

  @ApiProperty({
    type: MoneyResponse,
    description:
      'Puesta al día incluida en las cuotas al tomar una vacante (COPAYNI-59); cero en un turno normal',
  })
  catchUp!: MoneyResponse;

  @ApiProperty({ description: 'false si es un reintento de una unión ya hecha (HTTP 200)' })
  created!: boolean;

  static from({ circleId, terms, quote, created }: JoinCircleResult): JoinCircleResponse {
    return {
      circleId,
      startsOn: terms.startsOnPeriod.toString(),
      startsOnDate: terms.startsOn.toString(),
      payout: MoneyResponse.from(terms.payout),
      months: terms.months,
      turns: terms.turns,
      cadence: terms.cadence.id,
      endsOnDate: terms.endsOnDate.toString(),
      position: quote.position,
      payoutPeriod: quote.payoutPeriod.toString(),
      type: quote.type,
      installments: quote.installments.map((installment) => MoneyResponse.from(installment)),
      netPayout: MoneyResponse.from(quote.netPayout),
      catchUp: MoneyResponse.from(catchUpTotal(quote)),
      retention: MoneyResponse.from(quote.retention),
      created,
    };
  }
}
