import {
  type CircleCycleRepositoryPort,
  type StoredCycle,
} from '@src/modules/circles/application/ports/circle-cycle-repository.port';
import {
  type CircleCycle,
  type Disbursement,
  type Expulsion,
  type Installment,
} from '@src/modules/circles/domain/entities/circle-cycle';
import { type Period } from '@src/shared/domain/value-objects/period';

/** Doble de prueba con la semántica del puerto: bloqueo por círculo y guardado todo o nada. */
export class InMemoryCircleCycleRepository implements CircleCycleRepositoryPort {
  private readonly cycles = new Map<string, StoredCycle>();
  private readonly locked = new Set<string>();
  /** Todas las cuotas guardadas, por (círculo, turno, mes), como el índice único de PostgreSQL. */
  readonly installments = new Map<string, Installment>();
  readonly payouts: (Disbursement & { circleId: string })[] = [];
  /** Una por (círculo, miembro), como el índice único de PostgreSQL. */
  readonly expulsions: (Expulsion & { circleId: string })[] = [];

  add(stored: StoredCycle): void {
    this.cycles.set(stored.circleId, stored);
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

  async withLock(
    circleId: string,
    work: (stored: StoredCycle) => Promise<CircleCycle>,
  ): Promise<boolean> {
    if (this.locked.has(circleId)) return false;
    this.locked.add(circleId);
    try {
      const stored = this.cycles.get(circleId);
      if (!stored) throw new Error(`No existe el círculo ${circleId}`);
      this.save(await work({ ...stored, installments: [...stored.installments] }));
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
      state: cycle.state,
      currentPeriod: current,
      // Los expulsados ya no se cargan, como `expelled_at` en PostgreSQL.
      members: stored.members.filter(({ userId }) =>
        cycle.members.some((member) => member.userId === userId),
      ),
      installments: current
        ? cycle.installments.filter(({ period }) => period.equals(current))
        : [],
    });
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
  }
}
