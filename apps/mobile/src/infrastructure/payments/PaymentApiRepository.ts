import { z } from 'zod';

import type { PaymentRepositoryPort } from '@/domain/payments/ports/PaymentRepositoryPort';
import type { PaymentSummary } from '@/domain/payments/PaymentSummary';
import type {
  TransactionKind,
  TransactionsPage,
  TransactionType,
} from '@/domain/payments/Transaction';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import { moneyDto, toMoney } from '@/infrastructure/circles/moneyDto';

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** DTO de GET /me/payments/summary (docs/api/payments.md). */
const summaryDto = z.object({
  hasDuePayments: z.boolean(),
  totalDue: moneyDto.nullable(),
  nextDueOn: z.string().regex(DATE).nullable(),
  debt: moneyDto.nullable(),
  duePayments: z.array(
    z.object({
      circleId: z.string().min(1),
      period: z.string().regex(PERIOD),
      dueOn: z.string().regex(DATE),
      amount: moneyDto,
      status: z.enum(['pending', 'overdue']),
    }),
  ),
});

const KIND_BY_DTO = {
  installment: 'installment',
  debt_settlement: 'debtSettlement',
  payout: 'payout',
  refund: 'refund',
} as const satisfies Record<string, TransactionKind>;

/** DTO de GET /me/transactions (docs/api/payments.md). */
const transactionsDto = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1),
      type: z.enum(['payment', 'payout']),
      kind: z.enum(['installment', 'debt_settlement', 'payout', 'refund']),
      circleId: z.string().min(1),
      period: z.string().regex(PERIOD).nullable(),
      amount: moneyDto,
      occurredAt: z.iso.datetime({ offset: true }),
    }),
  ),
  nextCursor: z.string().min(1).nullable(),
});

/** Adaptador HTTP de la sección Payment: resumen (COPAYNI-35) e historial (COPAYNI-41). */
export class PaymentApiRepository implements PaymentRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async getSummary(signal?: AbortSignal): Promise<PaymentSummary> {
    const dto = await this.http.get('/me/payments/summary', {
      signal,
      parse: (data) => summaryDto.parse(data),
    });
    return {
      hasDuePayments: dto.hasDuePayments,
      totalDue: dto.totalDue && toMoney(dto.totalDue),
      nextDueOn: dto.nextDueOn,
      debt: dto.debt && toMoney(dto.debt),
      duePayments: dto.duePayments.map((due) => ({ ...due, amount: toMoney(due.amount) })),
    };
  }

  async listTransactions(
    type: TransactionType,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<TransactionsPage> {
    const dto = await this.http.get('/me/transactions', {
      query: { type, cursor },
      signal,
      parse: (data) => transactionsDto.parse(data),
    });
    return {
      items: dto.items.map((item) => ({
        ...item,
        kind: KIND_BY_DTO[item.kind],
        amount: toMoney(item.amount),
        occurredAt: new Date(item.occurredAt),
      })),
      nextCursor: dto.nextCursor,
    };
  }
}
