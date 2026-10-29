import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import { type MyCirclesPage } from '../../../application/use-cases/list-my-circles.use-case';
import { SLOT_TYPES, type SlotType } from '../../../domain/services/slot-pricing';
import { MoneyResponse } from './join-config.response';

const STATUSES = ['active', 'finished'] as const;

export class MyCirclesQuery {
  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status!: (typeof STATUSES)[number];

  @ApiPropertyOptional({ description: 'nextCursor de la página anterior' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 50, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

export class MyCircleResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ enum: STATUSES })
  status!: (typeof STATUSES)[number];

  @ApiProperty({ type: MoneyResponse })
  payout!: MoneyResponse;

  @ApiProperty({ example: 10 })
  months!: number;

  @ApiProperty({ example: '2026-11', description: 'Primer mes (YYYY-MM)' })
  startsOn!: string;

  @ApiProperty({ example: '2027-08', description: 'Último mes (YYYY-MM)' })
  endsOn!: string;

  @ApiProperty({ example: 3, description: 'Slot del usuario: 1 = cobra el primer mes' })
  position!: number;

  @ApiProperty({ example: '2027-01', description: 'Mes de cobro del usuario (YYYY-MM)' })
  payoutPeriod!: string;

  @ApiProperty({ enum: SLOT_TYPES })
  type!: SlotType;

  @ApiProperty({ type: [MoneyResponse], description: 'Una cuota por mes del círculo, en orden' })
  installments!: MoneyResponse[];

  @ApiProperty({ type: MoneyResponse, description: 'Admin Fees del slot' })
  adminFee!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Lo que recibe en su mes de cobro' })
  netPayout!: MoneyResponse;

  @ApiProperty({ format: 'date-time' })
  joinedAt!: string;
}

/** Contrato `GET /v1/me/circles` (docs/api/circles.md). */
export class MyCirclesResponse {
  @ApiProperty({ type: [MyCircleResponse] })
  items!: MyCircleResponse[];

  @ApiProperty({ type: String, nullable: true, description: 'null si no hay más páginas' })
  nextCursor!: string | null;

  static from({ items, nextCursor }: MyCirclesPage): MyCirclesResponse {
    return {
      items: items.map(({ circleId, status, terms, quote, joinedAt }) => ({
        circleId,
        status,
        payout: MoneyResponse.from(terms.payout),
        months: terms.months,
        startsOn: terms.startsOn.toString(),
        endsOn: terms.endsOn.toString(),
        position: quote.position,
        payoutPeriod: quote.payoutPeriod.toString(),
        type: quote.type,
        installments: quote.installments.map((installment) => MoneyResponse.from(installment)),
        adminFee: MoneyResponse.from(quote.adminFee),
        netPayout: MoneyResponse.from(quote.netPayout),
        joinedAt: joinedAt.toISOString(),
      })),
      nextCursor,
    };
  }
}
