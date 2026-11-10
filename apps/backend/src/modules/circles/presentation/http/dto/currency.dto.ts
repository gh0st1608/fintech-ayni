import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';

/** `?currency=` de join-config (pending-scope M2). */
export class CurrencyQuery {
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
