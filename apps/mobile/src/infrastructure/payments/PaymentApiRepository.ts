import { z } from 'zod';

import type { PaymentRepositoryPort } from '@/domain/payments/ports/PaymentRepositoryPort';
import type { InstallmentPaymentResult } from '@/domain/payments/InstallmentPayment';
import type { PaymentSettings } from '@/domain/payments/PaymentSettings';
import type { PaymentSummary } from '@/domain/payments/PaymentSummary';
import type { PayoutEligibility, PayoutRequirement } from '@/domain/payments/PayoutEligibility';
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
      installmentId: z.string().min(1),
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

const REQUIREMENT_BY_DTO = {
  national_id: 'nationalId',
  insurance_note: 'insuranceNote',
  payout_method: 'payoutMethod',
  contract: 'contract',
  due_payments: 'duePayments',
} as const satisfies Record<string, PayoutRequirement>;

/** DTO de GET /me/payout-eligibility. Un requisito que esta versión no conoce se ignora. */
const eligibilityDto = z.object({
  isEligible: z.boolean(),
  requirements: z.array(
    z.object({
      requirement: z.string(),
      status: z.enum(['met', 'pending', 'unavailable']),
    }),
  ),
});

/** DTO de POST /me/installments/:id/pay. */
const paymentResultDto = z.object({
  status: z.enum(['paid', 'pending']),
  paymentId: z.string().min(1),
});

/** DTO de GET y PATCH /me/payment-settings. */
const settingsDto = z.object({ deductPayInFromPayout: z.boolean() });

const isKnownRequirement = (value: string): value is keyof typeof REQUIREMENT_BY_DTO =>
  value in REQUIREMENT_BY_DTO;

/**
 * Adaptador HTTP de la sección Payment: resumen (COPAYNI-35), historial (COPAYNI-41),
 * elegibilidad del payout (COPAYNI-36) y preferencias (COPAYNI-38).
 */
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

  async getPayoutEligibility(signal?: AbortSignal): Promise<PayoutEligibility> {
    const dto = await this.http.get('/me/payout-eligibility', {
      signal,
      parse: (data) => eligibilityDto.parse(data),
    });
    return {
      isEligible: dto.isEligible,
      requirements: dto.requirements.flatMap(({ requirement, status }) =>
        isKnownRequirement(requirement)
          ? [{ requirement: REQUIREMENT_BY_DTO[requirement], status }]
          : [],
      ),
    };
  }

  getSettings(signal?: AbortSignal): Promise<PaymentSettings> {
    return this.http.get('/me/payment-settings', {
      signal,
      parse: (data) => settingsDto.parse(data),
    });
  }

  updateSettings(settings: PaymentSettings): Promise<PaymentSettings> {
    return this.http.patch('/me/payment-settings', {
      body: { deductPayInFromPayout: settings.deductPayInFromPayout },
      parse: (data) => settingsDto.parse(data),
    });
  }

  payInstallment(
    installmentId: string,
    payment: { method: 'yape'; token: string } | { method: 'card'; cardId: string },
    idempotencyKey: string,
  ): Promise<InstallmentPaymentResult> {
    return this.http.post(`/me/installments/${encodeURIComponent(installmentId)}/pay`, {
      idempotencyKey,
      body: payment,
      parse: (data) => paymentResultDto.parse(data),
    });
  }
}
