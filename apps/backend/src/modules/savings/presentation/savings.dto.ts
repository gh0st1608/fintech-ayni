import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

import { MoneyResponse } from '../../circles/presentation/http/dto/join-config.response';
import { type SavingPlan, type SavingQuote } from '../domain/saving-catalog';

export class SavingPlanResponse {
  @ApiProperty({ example: 'lite', description: 'Clave del plan; la app la traduce' })
  id!: string;

  @ApiProperty({ type: MoneyResponse, description: 'Monto que ahorra' })
  target!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Cashback máximo ("hasta X extra")' })
  maxCashback!: MoneyResponse;
}

/** Contrato de `GET /v1/savings/plans` (docs/api/savings.md). */
export class SavingPlansResponse {
  @ApiProperty({ type: [SavingPlanResponse], description: 'Del monto menor al mayor' })
  items!: SavingPlanResponse[];

  @ApiProperty({ type: [Number], example: [6, 12, 24], description: 'Duraciones ofrecidas' })
  durations!: number[];

  static from(plans: SavingPlan[], durations: number[]): SavingPlansResponse {
    return {
      items: plans.map(({ id, target, maxCashback }) => ({
        id,
        target: MoneyResponse.from(target),
        maxCashback: MoneyResponse.from(maxCashback),
      })),
      durations,
    };
  }
}

export class SavingQuoteQuery {
  @ApiProperty({ example: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  months!: number;
}

/** Contrato de `GET /v1/savings/plans/:id/quote` (docs/api/savings.md). */
export class SavingQuoteResponse {
  @ApiProperty({ example: 'lite' })
  planId!: string;

  @ApiProperty({ example: 12 })
  months!: number;

  @ApiProperty({ type: MoneyResponse, description: 'La cuota mensual (la mayor, si no es exacta)' })
  monthlyInstallment!: MoneyResponse;

  @ApiProperty({ type: [MoneyResponse], description: 'Una cuota por mes, en orden' })
  installments!: MoneyResponse[];

  @ApiProperty({ type: MoneyResponse })
  target!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse })
  cashback!: MoneyResponse;

  @ApiProperty({ type: MoneyResponse, description: 'Lo ahorrado más el cashback' })
  total!: MoneyResponse;

  @ApiProperty({ example: '2026-12', description: 'Mes de la primera cuota (YYYY-MM)' })
  startsOn!: string;

  @ApiProperty({ example: '2027-12', description: 'Mes en que recibe el total (YYYY-MM)' })
  payoutPeriod!: string;

  static from(quote: SavingQuote): SavingQuoteResponse {
    return {
      planId: quote.planId,
      months: quote.months,
      monthlyInstallment: MoneyResponse.from(quote.installments[0]!),
      installments: quote.installments.map((installment) => MoneyResponse.from(installment)),
      target: MoneyResponse.from(quote.target),
      cashback: MoneyResponse.from(quote.cashback),
      total: MoneyResponse.from(quote.total),
      startsOn: quote.startsOn.toString(),
      payoutPeriod: quote.payoutPeriod.toString(),
    };
  }
}
