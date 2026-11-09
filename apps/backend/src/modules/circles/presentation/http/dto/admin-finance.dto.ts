import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

import { type FundMovement } from '../../../application/ports/admin-finance-query.port';
import {
  type FundBalanceView,
  type InstallmentView,
  type MaskedMember,
  type PayoutView,
} from '../../../application/use-cases/admin-finance.use-cases';
import {
  INSTALLMENT_STATUSES,
  type InstallmentStatus,
} from '../../../domain/entities/circle-cycle';
import { MoneyResponse } from './join-config.response';

export class FinancePageQuery {
  @ApiPropertyOptional({ description: 'nextCursor de la página anterior' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  cursor?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 25 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class InstallmentsQuery extends FinancePageQuery {
  @ApiPropertyOptional({ enum: INSTALLMENT_STATUSES })
  @IsOptional()
  @IsIn(INSTALLMENT_STATUSES)
  status?: InstallmentStatus;

  @ApiPropertyOptional({ example: '2026-12', description: 'Mes de la cuota (AAAA-MM)' })
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period debe tener la forma AAAA-MM' })
  period?: string;
}

export class FinanceMemberResponse {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ nullable: true, type: String, example: 'Juana P.' })
  name!: string | null;

  static from(member: MaskedMember): FinanceMemberResponse {
    return { userId: member.userId, name: member.name };
  }
}

export class InstallmentTotalResponse {
  @ApiProperty({ enum: INSTALLMENT_STATUSES })
  status!: InstallmentStatus;

  @ApiProperty()
  count!: number;

  @ApiProperty({ type: MoneyResponse })
  total!: MoneyResponse;
}

export class InstallmentResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ description: 'Turno' })
  position!: number;

  @ApiProperty({ example: '2026-12' })
  period!: string;

  @ApiProperty({ example: '2026-12-01' })
  dueOn!: string;

  @ApiProperty({ type: MoneyResponse })
  amount!: MoneyResponse;

  @ApiProperty({ enum: INSTALLMENT_STATUSES })
  status!: InstallmentStatus;

  @ApiProperty({ nullable: true, type: String })
  paidAt!: string | null;

  @ApiProperty({ type: FinanceMemberResponse })
  member!: FinanceMemberResponse;

  static from(item: InstallmentView): InstallmentResponse {
    return {
      id: item.id,
      circleId: item.circleId,
      position: item.position,
      period: item.period,
      dueOn: item.dueOn,
      amount: MoneyResponse.from(item.amount),
      status: item.status,
      paidAt: item.paidAt?.toISOString() ?? null,
      member: FinanceMemberResponse.from(item.member),
    };
  }
}

export class InstallmentsResponse {
  @ApiProperty({ type: [InstallmentTotalResponse], description: 'Por estado y moneda' })
  totals!: InstallmentTotalResponse[];

  @ApiProperty({ type: [InstallmentResponse] })
  items!: InstallmentResponse[];

  @ApiPropertyOptional({ nullable: true, type: String })
  nextCursor!: string | null;
}

export class PayoutResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty()
  position!: number;

  @ApiProperty({ example: '2026-12' })
  period!: string;

  @ApiProperty({ type: MoneyResponse })
  amount!: MoneyResponse;

  @ApiProperty()
  disbursedAt!: string;

  @ApiProperty({ type: FinanceMemberResponse })
  member!: FinanceMemberResponse;

  static from(item: PayoutView): PayoutResponse {
    return {
      id: item.id,
      circleId: item.circleId,
      position: item.position,
      period: item.period,
      amount: MoneyResponse.from(item.amount),
      disbursedAt: item.disbursedAt.toISOString(),
      member: FinanceMemberResponse.from(item.member),
    };
  }
}

export class PayoutsResponse {
  @ApiProperty({ type: [PayoutResponse] })
  items!: PayoutResponse[];

  @ApiPropertyOptional({ nullable: true, type: String })
  nextCursor!: string | null;
}

export class FundBalanceResponse {
  @ApiProperty({ type: MoneyResponse })
  balance!: MoneyResponse;

  @ApiProperty()
  activeCircles!: number;

  @ApiProperty({ type: MoneyResponse, description: 'N cuotas base por círculo en curso (R18)' })
  minimum!: MoneyResponse;

  @ApiProperty()
  belowMinimum!: boolean;

  static from(view: FundBalanceView): FundBalanceResponse {
    return {
      balance: MoneyResponse.from(view.balance),
      activeCircles: view.activeCircles,
      minimum: MoneyResponse.from(view.minimum),
      belowMinimum: view.belowMinimum,
    };
  }
}

export class FundMovementResponse {
  @ApiProperty()
  transactionKey!: string;

  @ApiProperty({ example: 'fund_contribution' })
  kind!: string;

  @ApiProperty({ nullable: true, type: String })
  circleId!: string | null;

  @ApiProperty({ nullable: true, type: String, example: '2026-12' })
  period!: string | null;

  @ApiProperty({ nullable: true, type: String, description: 'Solo en movimientos manuales' })
  reason!: string | null;

  @ApiProperty({ type: MoneyResponse, description: 'Positivo entra al fondo; negativo sale' })
  amount!: MoneyResponse;

  @ApiProperty()
  createdAt!: string;

  static from(movement: FundMovement): FundMovementResponse {
    return {
      transactionKey: movement.transactionKey,
      kind: movement.kind,
      circleId: movement.circleId,
      period: movement.period,
      reason: movement.reason,
      amount: MoneyResponse.from(movement.amount),
      createdAt: movement.createdAt.toISOString(),
    };
  }
}

export class GuaranteeFundResponse {
  @ApiProperty({ type: [FundBalanceResponse], description: 'Una por moneda' })
  balances!: FundBalanceResponse[];

  @ApiProperty({ type: [FundMovementResponse] })
  items!: FundMovementResponse[];

  @ApiPropertyOptional({ nullable: true, type: String })
  nextCursor!: string | null;
}
