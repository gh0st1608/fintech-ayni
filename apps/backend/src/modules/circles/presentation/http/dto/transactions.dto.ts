import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import {
  type TransactionKind,
  type TransactionPage,
  TRANSACTION_TYPES,
  type TransactionType,
} from '../../../application/ports/payments-query.port';
import { MoneyResponse } from './join-config.response';

const KINDS: TransactionKind[] = ['installment', 'debt_settlement', 'payout', 'refund'];

export class TransactionsQuery {
  @ApiProperty({ enum: TRANSACTION_TYPES })
  @IsIn(TRANSACTION_TYPES)
  type!: TransactionType;

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

export class TransactionResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: TRANSACTION_TYPES })
  type!: TransactionType;

  @ApiProperty({ enum: KINDS })
  kind!: TransactionKind;

  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ nullable: true, type: String, example: '2026-12', description: 'Mes del círculo' })
  period!: string | null;

  @ApiProperty({ type: MoneyResponse })
  amount!: MoneyResponse;

  @ApiProperty({ example: '2026-12-05T17:00:00.000Z', description: 'ISO 8601 en UTC' })
  occurredAt!: string;
}

/** Contrato de `GET /v1/me/transactions` (docs/api/payments.md). */
export class TransactionsResponse {
  @ApiProperty({ type: [TransactionResponse] })
  items!: TransactionResponse[];

  @ApiProperty({ nullable: true, type: String })
  nextCursor!: string | null;

  static from({ items, nextCursor }: TransactionPage): TransactionsResponse {
    return {
      items: items.map((item) => ({
        id: item.id,
        type: item.type,
        kind: item.kind,
        circleId: item.circleId,
        period: item.period?.toString() ?? null,
        amount: MoneyResponse.from(item.amount),
        occurredAt: item.occurredAt.toISOString(),
      })),
      nextCursor,
    };
  }
}
