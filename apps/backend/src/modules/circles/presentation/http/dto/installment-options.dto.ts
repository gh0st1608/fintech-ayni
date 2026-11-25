import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

import { type InstallmentOptionsResult } from '../../../application/use-cases/get-installment-options.use-case';
import { type InstallmentOption } from '../../../domain/services/installment-options';
import { CADENCE_IDS, type CadenceId } from '../../../domain/value-objects/cadence';
import { MoneyResponse } from './join-config.response';

export class InstallmentOptionsQuery {
  @ApiProperty({ example: 3000000, description: 'Payout elegido, en unidades menores' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  payoutAmount!: number;

  @ApiProperty({
    required: false,
    example: 'PEN',
    description:
      "Moneda del Game'ya (ISO 4217), una de join-config.currencies; la oficial si falta",
  })
  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currency?: string;
}

export class InstallmentOptionResponse {
  @ApiProperty({ example: 12, description: 'Turnos, que son los puestos y las cuotas' })
  turns!: number;

  @ApiProperty({
    example: 12,
    deprecated: true,
    description: 'Alias de turns, que es como lo llama la app publicada (COPAYNI-125)',
  })
  months!: number;

  @ApiProperty({
    type: MoneyResponse,
    description: 'Cuota base (payout / turnos); la del slot elegido puede variar',
  })
  installment!: MoneyResponse;

  @ApiProperty({ enum: CADENCE_IDS, description: 'Cadencia en la que se calculó la opción' })
  cadence!: CadenceId;

  @ApiProperty({ example: 'Mes', description: 'Cómo se llama un turno: Mes, Quincena o Semana' })
  unit!: string;

  @ApiProperty({
    example: 365,
    description: 'Duración aproximada en días corridos, para comparar opciones de otra cadencia',
  })
  approximateDays!: number;
}

/** Un monto cercano que sí admite alguna duración (COPAYNI-125). */
export class NearestOfferResponse {
  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty({ type: [InstallmentOptionResponse] })
  options!: InstallmentOptionResponse[];
}

const optionOf = (option: InstallmentOption): InstallmentOptionResponse => ({
  turns: option.turns,
  months: option.months,
  installment: MoneyResponse.from(option.installment),
  cadence: option.cadence,
  unit: option.unit,
  approximateDays: option.approximateDays,
});

/** Contrato `GET /v1/circles/installment-options` (docs/api/circles.md). */
export class InstallmentOptionsResponse {
  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty({ enum: CADENCE_IDS })
  cadence!: CadenceId;

  @ApiProperty({ type: [InstallmentOptionResponse], description: 'De menor a mayor duración' })
  options!: InstallmentOptionResponse[];

  @ApiProperty({
    type: [NearestOfferResponse],
    description:
      'Con options vacío, los montos ofrecibles más cercanos: el payout elegido no se reparte ' +
      'en ninguna de las duraciones configuradas sin dejar resto en céntimos (COPAYNI-125)',
  })
  alternatives!: NearestOfferResponse[];

  static from({
    payout,
    cadence,
    options,
    alternatives,
  }: InstallmentOptionsResult): InstallmentOptionsResponse {
    return {
      payout: MoneyResponse.from(payout),
      cadence,
      options: options.map(optionOf),
      alternatives: alternatives.map((offer) => ({
        payout: MoneyResponse.from(offer.payout),
        options: offer.options.map(optionOf),
      })),
    };
  }
}
