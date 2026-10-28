import type { JoinCircleRequest, JoinedCircle } from '@/domain/circles/JoinedCircle';
import type { CircleMembershipRepositoryPort } from '@/domain/circles/ports/CircleMembershipRepositoryPort';
import { AppError, type AppErrorKind } from '@/domain/shared/errors/AppError';
import { Money } from '@/domain/shared/value-objects/Money';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

/** Rechazos del backend que el adaptador falso puede simular, con el tipo que da el cliente HTTP (422 y 409). */
const REJECTIONS = {
  NATIONAL_ID_REQUIRED: 'validation',
  MONTHLY_LIMIT_EXCEEDED: 'validation',
  PAYOUT_METHOD_REQUIRED: 'validation',
  PAYOUT_METHOD_LIMIT_EXCEEDED: 'validation',
  SLOT_TAKEN: 'conflict',
  CIRCLE_ALREADY_STARTED: 'conflict',
} as const satisfies Record<string, AppErrorKind>;

export type JoinRejection = keyof typeof REJECTIONS;

export interface InMemoryCircleMembershipOptions {
  latencyMs?: number;
  /** Rechaza la próxima unión con ese código (p. ej. para probar la redirección a KYC). */
  rejectWith?: JoinRejection;
  /** Primer mes de un círculo nuevo (YYYY-MM); por defecto, el mes siguiente al actual. */
  startsOn?: string;
}

function nextMonth(): string {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number);
  const index = year! * 12 + (month! - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Unión falsa (contract-first) con la idempotencia del backend: la misma clave devuelve la misma
 * unión con `created: false`. Las cuotas son la cuota base, sin fees ni Admin Fees.
 */
export class InMemoryCircleMembershipRepository implements CircleMembershipRepositoryPort {
  private readonly latencyMs: number;
  private readonly joins = new Map<string, JoinedCircle>();
  private rejection: JoinRejection | undefined;

  constructor(private readonly options: InMemoryCircleMembershipOptions = {}) {
    this.latencyMs = options.latencyMs ?? 400;
    this.rejection = options.rejectWith;
  }

  async join(request: JoinCircleRequest, idempotencyKey: string): Promise<JoinedCircle> {
    await simulateLatency(this.latencyMs);
    const previous = this.joins.get(idempotencyKey);
    if (previous) return { ...previous, created: false };
    if (this.rejection) {
      const code = this.rejection;
      this.rejection = undefined;
      throw new AppError(REJECTIONS[code], `Join rejected: ${code}`, { code });
    }

    const { payout, months, position } = request;
    const startsOn = this.options.startsOn ?? nextMonth();
    const installment = Money.of(payout.amount / months, payout.currency);
    const joined: JoinedCircle = {
      circleId: request.circleId ?? `fake-circle-${this.joins.size + 1}`,
      startsOn,
      payout,
      months,
      position,
      payoutPeriod: addMonths(startsOn, position - 1),
      type: 'lowestFees',
      installments: Array.from({ length: months }, () => installment),
      netPayout: payout,
      created: true,
    };
    this.joins.set(idempotencyKey, joined);
    return joined;
  }

  /** Simula un rechazo del backend en la próxima unión. */
  rejectNextWith(code: JoinRejection): void {
    this.rejection = code;
  }

  get joinCount(): number {
    return this.joins.size;
  }
}
