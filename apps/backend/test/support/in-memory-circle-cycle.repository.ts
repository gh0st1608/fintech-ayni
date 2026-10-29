import {
  type CircleCycleRepositoryPort,
  type StoredCycle,
} from '@src/modules/circles/application/ports/circle-cycle-repository.port';
import {
  type CircleCycle,
  type CycleAdminEvent,
  type Disbursement,
  type Expulsion,
  type Installment,
} from '@src/modules/circles/domain/entities/circle-cycle';
import { type LedgerTransaction } from '@src/modules/circles/domain/value-objects/ledger-transaction';
import { Money } from '@src/shared/domain/value-objects/money';
import { type Period } from '@src/shared/domain/value-objects/period';
import { NotFoundError } from '@src/shared/errors/app-error';

/**
 * Doble de prueba con la semántica del puerto: bloqueo por círculo, guardado todo o nada y un
 * movimiento contable por clave. El fondo es uno solo, como en PostgreSQL.
 */
export class InMemoryCircleCycleRepository implements CircleCycleRepositoryPort {
  private readonly cycles = new Map<string, StoredCycle>();
  private readonly locked = new Set<string>();
  /** Todas las cuotas guardadas, por (círculo, turno, mes), como el índice único de PostgreSQL. */
  readonly installments = new Map<string, Installment>();
  readonly payouts: (Disbursement & { circleId: string })[] = [];
  /** Una por (círculo, miembro), como el índice único de PostgreSQL. */
  readonly expulsions: (Expulsion & { circleId: string })[] = [];
  /** Movimientos guardados, por clave. */
  readonly ledger = new Map<string, LedgerTransaction>();
  /** Pausas y reanudaciones guardadas (COPAYNI-61). */
  readonly adminEvents: (CycleAdminEvent & { circleId: string })[] = [];

  add(
    stored: Omit<StoredCycle, 'fundBalance' | 'pendingRefunds' | 'pausedOn'> &
      Partial<Pick<StoredCycle, 'pendingRefunds' | 'pausedOn'>>,
  ): void {
    this.cycles.set(stored.circleId, {
      ...stored,
      fundBalance: Money.zero(stored.terms.currency),
      pendingRefunds: stored.pendingRefunds ?? [],
      pausedOn: stored.pausedOn ?? null,
    });
  }

  /** Saldo de una cuenta en una moneda, sumando los movimientos guardados. */
  balance(account: string, currency = 'PEN'): Money {
    let total = Money.zero(currency);
    for (const transaction of this.ledger.values()) {
      for (const entry of transaction.entries) {
        if (entry.account === account && entry.amount.currency === currency) {
          total = total.add(entry.amount);
        }
      }
    }
    return total;
  }

  /** Movimiento manual (p. ej. capital semilla). */
  record(transaction: LedgerTransaction): void {
    if (!this.ledger.has(transaction.key)) this.ledger.set(transaction.key, transaction);
  }

  /** Un miembro nuevo toma una vacante (COPAYNI-59), como una membresía nueva en PostgreSQL. */
  join(circleId: string, member: StoredCycle['members'][number]): void {
    const stored = this.cycles.get(circleId)!;
    this.cycles.set(circleId, { ...stored, members: [...stored.members, member] });
  }

  get(circleId: string): StoredCycle | undefined {
    return this.cycles.get(circleId);
  }

  /** Simula otra ejecución que tiene el círculo bloqueado. */
  lock(circleId: string): void {
    this.locked.add(circleId);
  }

  listToAdvance(today: Period): Promise<string[]> {
    return Promise.resolve(
      [...this.cycles.values()]
        .filter(
          ({ state, terms }) =>
            state === 'contributing' || (state === 'collecting' && !terms.startsOn.isAfter(today)),
        )
        .map(({ circleId }) => circleId),
    );
  }

  /** Con `wait`, un círculo bloqueado no se salta: el doble no simula la espera. */
  async withLock(
    circleId: string,
    work: (stored: StoredCycle) => Promise<CircleCycle>,
    options: { wait?: boolean } = {},
  ): Promise<boolean> {
    if (this.locked.has(circleId) && !options.wait) return false;
    this.locked.add(circleId);
    try {
      const stored = this.cycles.get(circleId);
      if (!stored) throw new NotFoundError(`No existe el círculo ${circleId}`, 'CIRCLE_NOT_FOUND');
      this.save(
        await work({
          ...stored,
          installments: [...stored.installments],
          fundBalance: this.balance('guarantee_fund', stored.terms.currency),
        }),
      );
      return true;
    } finally {
      this.locked.delete(circleId);
    }
  }

  private save(cycle: CircleCycle): void {
    const stored = this.cycles.get(cycle.circleId)!;
    const current = cycle.currentPeriod;
    this.cycles.set(cycle.circleId, {
      ...stored,
      terms: cycle.terms,
      state: cycle.state,
      currentPeriod: current,
      pausedOn: cycle.pausedOn,
      pendingRefunds: cycle.isFinished()
        ? []
        : [
            ...stored.pendingRefunds,
            ...cycle.expulsions.flatMap(({ userId, paid, refund }) =>
              paid && refund ? [{ userId, paid, refund }] : [],
            ),
          ],
      // Los expulsados ya no se cargan, como `expelled_at` en PostgreSQL.
      members: stored.members.filter(({ userId }) =>
        cycle.members.some((member) => member.userId === userId),
      ),
      installments: current
        ? cycle.installments.filter(({ period }) => period.equals(current))
        : [],
    });
    if (cycle.calendarShift > 0 && current) {
      // Las cuotas del mes en curso pasaron al mes nuevo, como el UPDATE de PostgreSQL.
      const old = `:${current.addMonths(-cycle.calendarShift).toString()}`;
      for (const key of [...this.installments.keys()]) {
        if (key.startsWith(`${cycle.circleId}:`) && key.endsWith(old))
          this.installments.delete(key);
      }
    }
    for (const event of cycle.adminEvents)
      this.adminEvents.push({ ...event, circleId: cycle.circleId });
    for (const installment of cycle.installments) {
      const key = `${cycle.circleId}:${installment.position}:${installment.period.toString()}`;
      const previous = this.installments.get(key);
      this.installments.set(key, { ...installment, id: previous?.id ?? installment.id });
    }
    for (const payout of cycle.disbursements) {
      const exists = this.payouts.some(
        ({ circleId, period }) => circleId === cycle.circleId && period.equals(payout.period),
      );
      if (!exists) this.payouts.push({ ...payout, circleId: cycle.circleId });
    }
    for (const expulsion of cycle.expulsions) {
      const exists = this.expulsions.some(
        ({ circleId, userId }) => circleId === cycle.circleId && userId === expulsion.userId,
      );
      if (!exists) this.expulsions.push({ ...expulsion, circleId: cycle.circleId });
    }
    for (const transaction of cycle.ledger) this.record(transaction);
  }
}
