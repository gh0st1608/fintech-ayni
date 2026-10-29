import { ApiProperty } from '@nestjs/swagger';

import { type PaymentSummary } from '../../../application/use-cases/get-payment-summary.use-case';
import { MoneyResponse } from './join-config.response';

export class DuePaymentResponse {
  @ApiProperty({ format: 'uuid' })
  circleId!: string;

  @ApiProperty({ example: '2026-12', description: 'Mes del círculo (YYYY-MM)' })
  period!: string;

  @ApiProperty({ example: '2026-12-05', description: 'Vencimiento (YYYY-MM-DD)' })
  dueOn!: string;

  @ApiProperty({ type: MoneyResponse })
  amount!: MoneyResponse;

  @ApiProperty({ enum: ['pending', 'overdue'], description: 'overdue: el cobro falló, en gracia' })
  status!: 'pending' | 'overdue';
}

/** Contrato de `GET /v1/me/payments/summary` (docs/api/payments.md). */
export class PaymentSummaryResponse {
  @ApiProperty({ description: 'true si tiene cuotas por pagar o una deuda por impago' })
  hasDuePayments!: boolean;

  @ApiProperty({ type: MoneyResponse, nullable: true, description: 'Suma de las cuotas por pagar' })
  totalDue!: MoneyResponse | null;

  @ApiProperty({ nullable: true, type: String, example: '2026-12-05' })
  nextDueOn!: string | null;

  @ApiProperty({ type: MoneyResponse, nullable: true, description: 'Deuda por impago con la mora' })
  debt!: MoneyResponse | null;

  @ApiProperty({ type: [DuePaymentResponse], description: 'De la que vence antes a la última' })
  duePayments!: DuePaymentResponse[];

  static from(summary: PaymentSummary): PaymentSummaryResponse {
    const { duePayments, totalDue, nextDueOn, debt } = summary;
    return {
      hasDuePayments: duePayments.length > 0 || debt !== null,
      totalDue: totalDue && MoneyResponse.from(totalDue),
      nextDueOn: nextDueOn?.toString() ?? null,
      debt: debt && MoneyResponse.from(debt),
      duePayments: duePayments.map((due) => ({
        circleId: due.circleId,
        period: due.period.toString(),
        dueOn: due.dueOn.toString(),
        amount: MoneyResponse.from(due.amount),
        status: due.status,
      })),
    };
  }
}
