import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

import {
  type TransactionDetail,
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

export class TransactionDetailQuery {
  @ApiProperty({ enum: TRANSACTION_TYPES, description: 'El tipo del historial de donde viene' })
  @IsIn(TRANSACTION_TYPES)
  type!: TransactionType;
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

/** Contrato de `GET /v1/me/transactions/:id` (docs/api/payments.md, COPAYNI-78). */
export class TransactionDetailResponse extends TransactionResponse {
  @ApiProperty({ type: MoneyResponse, description: 'Pozo del círculo, que lo identifica' })
  circlePayout!: MoneyResponse;

  @ApiProperty({ example: 4, description: 'Turno del usuario en ese círculo' })
  position!: number;

  @ApiProperty({
    type: MoneyResponse,
    nullable: true,
    description:
      'En un payout: lo que se descontó del pozo (retención, cuotas descontadas). null en los demás',
  })
  deductions!: MoneyResponse | null;

  static fromDetail(detail: TransactionDetail): TransactionDetailResponse {
    const { amount, circlePayout } = detail;
    const deducted = circlePayout.amount - amount.amount;
    return {
      id: detail.id,
      type: detail.type,
      kind: detail.kind,
      circleId: detail.circleId,
      period: detail.period?.toString() ?? null,
      amount: MoneyResponse.from(amount),
      occurredAt: detail.occurredAt.toISOString(),
      circlePayout: MoneyResponse.from(circlePayout),
      position: detail.position,
      deductions:
        detail.kind === 'payout' && circlePayout.currency === amount.currency
          ? { amount: Math.max(deducted, 0), currency: amount.currency }
          : null,
    };
  }
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
