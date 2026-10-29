import type { JoinCircleRequest, JoinedCircle } from '@/domain/circles/JoinedCircle';
import type { MyCircle, MyCirclesPage, MyCircleStatus } from '@/domain/circles/MyCircle';
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
  VACANCY_CLOSED: 'conflict',
  SLOT_NOT_ALLOWED: 'validation',
  MEMBER_BLOCKED: 'conflict',
} as const satisfies Record<string, AppErrorKind>;

export type JoinRejection = keyof typeof REJECTIONS;

export interface InMemoryCircleMembershipOptions {
  latencyMs?: number;
  /** Rechaza la próxima unión con ese código (p. ej. para probar la redirección a KYC). */
  rejectWith?: JoinRejection;
  /** Primer mes de un círculo nuevo (YYYY-MM); por defecto, el mes siguiente al actual. */
  startsOn?: string;
  /** Mis círculos ya existentes (p. ej. finalizados), además de los que se unan. */
  circles?: MyCircle[];
  /** Mes actual (YYYY-MM) para separar activos de finalizados; por defecto, el del dispositivo. */
  currentPeriod?: string;
  /** Círculos por página de mis círculos; por defecto 20, como el backend. */
  pageSize?: number;
}

function nextMonth(): string {
  return addMonths(thisMonth(), 1);
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function addMonths(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number);
  const index = year! * 12 + (month! - 1) + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
}

/**
 * Membresías falsas (contract-first). Unirse tiene la idempotencia del backend: la misma clave
 * devuelve la misma unión con `created: false`. Las cuotas son la cuota base, sin fees ni Admin
 * Fees. Lo que se une aparece en mis círculos, de la unión más reciente a la más antigua.
 */
export class InMemoryCircleMembershipRepository implements CircleMembershipRepositoryPort {
  private readonly latencyMs: number;
  private readonly joins = new Map<string, JoinedCircle>();
  private rejection: JoinRejection | undefined;
  private readonly mine: MyCircle[];

  constructor(private readonly options: InMemoryCircleMembershipOptions = {}) {
    this.latencyMs = options.latencyMs ?? 400;
    this.rejection = options.rejectWith;
    this.mine = [...(options.circles ?? [])];
  }

  async listMine(
    status: MyCircleStatus,
    cursor: string | null,
    signal?: AbortSignal,
  ): Promise<MyCirclesPage> {
    await simulateLatency(this.latencyMs, signal);
    const current = this.options.currentPeriod ?? thisMonth();
    // Los períodos YYYY-MM se comparan como texto.
    const matching = this.mine.filter(
      ({ endsOn, expelled }) => (endsOn < current || expelled ? 'finished' : 'active') === status,
    );
    const offset = cursor === null ? 0 : Number(cursor);
    const size = this.options.pageSize ?? 20;
    const next = offset + size;
    return {
      items: matching.slice(offset, next).map((circle) => ({ ...circle, status })),
      nextCursor: next < matching.length ? String(next) : null,
    };
  }

  async join(request: JoinCircleRequest, idempotencyKey: string): Promise<JoinedCircle> {
    await simulateLatency(this.latencyMs);
    const previous = this.joins.get(idempotencyKey);
    if (previous) return { ...previous, created: false };
    if (this.rejection) {
      const code = this.rejection;
      this.rejection = undefined;
      // Como el backend: lo vencido (una cuota base) más 3 % de cargo por mora, en unidades menores.
      const installment = Math.round(request.payout.amount / request.months);
      const fieldErrors =
        code === 'MEMBER_BLOCKED'
          ? {
              amountDue: String(installment + Math.round(installment * 0.03)),
              currency: request.payout.currency,
            }
          : undefined;
      throw new AppError(REJECTIONS[code], `Join rejected: ${code}`, { code, fieldErrors });
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
      catchUp: Money.of(0, payout.currency),
      retention: Money.of(0, payout.currency),
      created: true,
    };
    this.joins.set(idempotencyKey, joined);
    this.mine.unshift({
      ...joined,
      status: 'active',
      endsOn: addMonths(startsOn, months - 1),
      adminFee: Money.of(0, payout.currency),
      joinedAt: new Date(),
      expelled: false,
    });
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
