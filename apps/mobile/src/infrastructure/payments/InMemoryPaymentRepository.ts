import type { DownloadedFile } from '@/domain/payments/ports/FileSharePort';
import type { PaymentRepositoryPort } from '@/domain/payments/ports/PaymentRepositoryPort';
import type { InstallmentPaymentResult } from '@/domain/payments/InstallmentPayment';
import type { PaymentSettings } from '@/domain/payments/PaymentSettings';
import type { PaymentStreak } from '@/domain/payments/PaymentStreak';
import type { PaymentSummary } from '@/domain/payments/PaymentSummary';
import type { PayoutEligibility } from '@/domain/payments/PayoutEligibility';
import type {
  Transaction,
  TransactionDetail,
  TransactionsPage,
  TransactionType,
} from '@/domain/payments/Transaction';
import { AppError } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

export interface InMemoryPaymentOptions {
  latencyMs?: number;
  /** Un círculo en curso con una cuota pendiente y movimientos; sin él, todo vacío. */
  withDuePayments?: boolean;
  pageSize?: number;
  /** Requisitos de la elegibilidad; por defecto, los del backend sin documentos ni firmas. */
  eligibility?: PayoutEligibility;
}

const DEFAULT_ELIGIBILITY: PayoutEligibility = {
  isEligible: false,
  requirements: [
    { requirement: 'nationalId', status: 'pending' },
    { requirement: 'insuranceNote', status: 'unavailable' },
    { requirement: 'payoutMethod', status: 'met' },
    { requirement: 'contract', status: 'unavailable' },
    { requirement: 'duePayments', status: 'met' },
  ],
};

/** Pagos falsos (solo dev y pruebas), con los mismos montos que los círculos falsos. */
export class InMemoryPaymentRepository implements PaymentRepositoryPort {
  private readonly latencyMs: number;
  private readonly withDuePayments: boolean;
  private readonly pageSize: number;
  private readonly eligibility: PayoutEligibility;
  settings: PaymentSettings = { deductPayInFromPayout: false };
  /** Cuotas ya pagadas desde la app. */
  readonly paid = new Set<string>();

  constructor(
    private readonly currency: string,
    options: InMemoryPaymentOptions = {},
  ) {
    this.latencyMs = options.latencyMs ?? 300;
    this.withDuePayments = options.withDuePayments ?? false;
    this.pageSize = options.pageSize ?? 20;
    this.eligibility = options.eligibility ?? DEFAULT_ELIGIBILITY;
  }

  async getPayoutEligibility(signal?: AbortSignal): Promise<PayoutEligibility> {
    await simulateLatency(this.latencyMs, signal);
    return this.eligibility;
  }

  async getSettings(signal?: AbortSignal): Promise<PaymentSettings> {
    await simulateLatency(this.latencyMs, signal);
    return { ...this.settings };
  }

  async payInstallment(installmentId: string): Promise<InstallmentPaymentResult> {
    await simulateLatency(this.latencyMs);
    if (this.paid.has(installmentId)) {
      throw new AppError('conflict', 'Already paid', { code: 'INSTALLMENT_NOT_PAYABLE' });
    }
    this.paid.add(installmentId);
    return { status: 'paid', paymentId: `pay-${installmentId}`, paidAt: new Date().toISOString() };
  }

  async updateSettings(settings: PaymentSettings): Promise<PaymentSettings> {
    await simulateLatency(this.latencyMs);
    this.settings = { ...settings };
    return { ...this.settings };
  }

  async getSummary(signal?: AbortSignal): Promise<PaymentSummary> {
    await simulateLatency(this.latencyMs, signal);
    if (!this.withDuePayments || this.paid.has('i-1')) {
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
        {
          installmentId: 'i-1',
          circleId: 'c-1',
          period: '2026-12',
          dueOn: '2026-12-05',
          amount,
          status: 'pending',
          position: 6,
          slots: 10,
          payout: Money.fromMajor(56_000, this.currency),
        },
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

  /** Con cuotas: tres meses a tiempo y el actual por pagar, como el ejemplo del Figma. */
  async getPaymentStreak(signal?: AbortSignal): Promise<PaymentStreak> {
    await simulateLatency(this.latencyMs, signal);
    if (!this.withDuePayments) return { months: 0, lastMonths: [] };
    return {
      months: 3,
      lastMonths: [
        { period: '2026-09', status: 'onTime' },
        { period: '2026-10', status: 'onTime' },
        { period: '2026-11', status: 'onTime' },
        { period: '2026-12', status: 'pending' },
      ],
    };
  }

  async getReceipt(type: TransactionType, id: string): Promise<DownloadedFile> {
    await this.getTransaction(type, id);
    return {
      filename: `ayni-comprobante-${id.slice(0, 8)}.pdf`,
      mimeType: 'application/pdf',
      bytes: new TextEncoder().encode('%PDF-1.4 comprobante simulado'),
    };
  }

  async getTransaction(
    type: TransactionType,
    id: string,
    signal?: AbortSignal,
  ): Promise<TransactionDetail> {
    await simulateLatency(this.latencyMs, signal);
    const found = this.transactions().find((item) => item.type === type && item.id === id);
    if (!found) {
      throw new AppError('not_found', 'Transaction not found', { code: 'TRANSACTION_NOT_FOUND' });
    }
    const circlePayout = Money.fromMajor(30_000, this.currency);
    return {
      ...found,
      circlePayout,
      position: found.kind === 'payout' ? 1 : 6,
      // El pozo del ejemplo es igual a lo recibido: sin retención ni cuotas descontadas.
      deductions:
        found.kind === 'payout'
          ? Money.of(circlePayout.amount - found.amount.amount, this.currency)
          : null,
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
