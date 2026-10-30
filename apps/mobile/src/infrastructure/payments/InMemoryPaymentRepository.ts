import type { PaymentRepositoryPort } from '@/domain/payments/ports/PaymentRepositoryPort';
import type { PaymentSummary } from '@/domain/payments/PaymentSummary';
import type { Transaction, TransactionsPage, TransactionType } from '@/domain/payments/Transaction';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryPaymentOptions {
  latencyMs?: number;
  /** Un círculo en curso con una cuota pendiente y movimientos; sin él, todo vacío. */
  withDuePayments?: boolean;
  pageSize?: number;
}

/** Pagos falsos (solo dev y pruebas), con los mismos montos que los círculos falsos. */
export class InMemoryPaymentRepository implements PaymentRepositoryPort {
  private readonly latencyMs: number;
  private readonly withDuePayments: boolean;
  private readonly pageSize: number;

  constructor(
    private readonly currency: string,
    options: InMemoryPaymentOptions = {},
  ) {
    this.latencyMs = options.latencyMs ?? 300;
    this.withDuePayments = options.withDuePayments ?? false;
    this.pageSize = options.pageSize ?? 20;
  }

  async getSummary(signal?: AbortSignal): Promise<PaymentSummary> {
    await simulateLatency(this.latencyMs, signal);
    if (!this.withDuePayments) {
      return {
        hasDuePayments: false,
        totalDue: null,
        nextDueOn: null,
        debt: null,
        duePayments: [],
      };
    }
    const amount = Money.fromMajor(5_600, this.currency);
    return {
      hasDuePayments: true,
      totalDue: amount,
      nextDueOn: '2026-12-05',
      debt: null,
      duePayments: [
        { circleId: 'c-1', period: '2026-12', dueOn: '2026-12-05', amount, status: 'pending' },
      ],
    };
  }

  async listTransactions(
    type: TransactionType,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<TransactionsPage> {
    await simulateLatency(this.latencyMs, signal);
    const all = this.transactions().filter((item) => item.type === type);
    const start = cursor ? Number(cursor) : 0;
    const end = start + this.pageSize;
    return {
      items: all.slice(start, end),
      nextCursor: end < all.length ? String(end) : null,
    };
  }

  private transactions(): Transaction[] {
    if (!this.withDuePayments) return [];
    const money = (major: number) => Money.fromMajor(major, this.currency);
    return [
      {
        id: 't-2',
        type: 'payment',
        kind: 'installment',
        circleId: 'c-1',
        period: '2026-11',
        amount: money(5_600),
        occurredAt: new Date('2026-11-05T15:00:00Z'),
      },
      {
        id: 't-1',
        type: 'payment',
        kind: 'debtSettlement',
        circleId: 'c-0',
        period: '2026-10',
        amount: money(5_250),
        occurredAt: new Date('2026-10-20T15:00:00Z'),
      },
      {
        id: 't-3',
        type: 'payout',
        kind: 'payout',
        circleId: 'c-0',
        period: '2026-09',
        amount: money(30_000),
        occurredAt: new Date('2026-09-05T15:00:00Z'),
      },
    ];
  }
}
