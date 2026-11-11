import { ApiProperty } from '@nestjs/swagger';

import { type MonthStatus, type PaymentStreak } from '../../../domain/services/payment-streak';

const MONTH_STATUSES = ['on_time', 'late', 'pending'] as const;

export class StreakMonthResponse {
  @ApiProperty({ example: '2026-11' })
  period!: string;

  @ApiProperty({ enum: MONTH_STATUSES, description: 'pending: todavía puede pagarse a tiempo' })
  status!: MonthStatus;
}

/** Contrato de `GET /v1/me/payment-streak` (docs/api/payments.md, COPAYNI-82). */
export class PaymentStreakResponse {
  @ApiProperty({ example: 3, description: 'Meses seguidos con las cuotas pagadas a tiempo' })
  months!: number;

  @ApiProperty({
    type: [StreakMonthResponse],
    description: 'Los últimos 4 meses con cuotas, del más antiguo al más reciente',
  })
  lastMonths!: StreakMonthResponse[];

  static from(streak: PaymentStreak): PaymentStreakResponse {
    return {
      months: streak.months,
      lastMonths: streak.lastMonths.map(({ period, status }) => ({
        period: period.toString(),
        status,
      })),
    };
  }
}
