import {
  type CircleRepositoryPort,
  IdempotencyKeyExistsError,
  InvalidCursorError,
  type JoinableCircleCriteria,
  type MembershipPage,
  type MembershipsQuery,
  type OpenCirclesCriteria,
} from '@src/modules/circles/application/ports/circle-repository.port';
import {
  AlreadyMemberError,
  Circle,
  type Membership,
  SlotTakenError,
} from '@src/modules/circles/domain/entities/circle';
import { type CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';

/** Cede el turno al event loop, como una consulta real: así se intercalan las solicitudes. */
const roundTrip = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/**
 * Doble de prueba con la semántica que exige el puerto: lecturas que pueden quedar viejas e
 * inserción atómica con unicidad por slot, usuario y clave (los índices únicos de PostgreSQL).
 */
export class InMemoryCircleRepository implements CircleRepositoryPort {
  private readonly circles = new Map<string, { terms: CircleTerms; memberships: Membership[] }>();
  /** Círculos cuyo ciclo terminó (COPAYNI-56). */
  private readonly finished = new Set<string>();
  /** `círculo:usuario` de las membresías expulsadas por impago. */
  private readonly expelled = new Set<string>();
  /** Orden de alta de las membresías, que hace de fecha de unión. */
  private readonly joins: { circleId: string; userId: string; joinedAt: Date }[] = [];

  add(circle: Circle): void {
    this.circles.set(circle.id, { terms: circle.terms, memberships: [...circle.memberships] });
    for (const { userId } of circle.memberships) this.recordJoin(circle.id, userId);
  }

  private recordJoin(circleId: string, userId: string): void {
    this.joins.push({
      circleId,
      userId,
      joinedAt: new Date(Date.UTC(2026, 0, 1, 0, this.joins.length)),
    });
  }

  /** Mismo orden que PostgreSQL (la más reciente primero); el cursor es la posición en la lista. */
  async listMemberships(query: MembershipsQuery): Promise<MembershipPage> {
    await roundTrip();
    const offset = query.cursor === null ? 0 : Number(query.cursor);
    if (!Number.isInteger(offset) || offset < 0) throw new InvalidCursorError();
    const matching = [...this.joins]
      .reverse()
      .filter(({ userId }) => userId === query.userId)
      .map(({ circleId, joinedAt }) => {
        const stored = this.circles.get(circleId)!;
        const member = stored.memberships.find(({ userId }) => userId === query.userId)!;
        const { position, price } = member;
        const expelled = this.expelled.has(`${circleId}:${query.userId}`);
        return {
          circleId,
          terms: stored.terms,
          position,
          ...(price && { price }),
          joinedAt,
          expelled,
        };
      })
      .filter(
        ({ circleId, expelled }) =>
          (this.finished.has(circleId) || expelled) === (query.status === 'finished'),
      );
    const items = matching.slice(offset, offset + query.limit);
    const next = offset + query.limit;
    return { items, nextCursor: next < matching.length ? String(next) : null };
  }

  async findById(id: string): Promise<Circle | null> {
    await roundTrip();
    const stored = this.circles.get(id);
    return stored ? Circle.restore({ id, ...stored }) : null;
  }

  async findByMembershipKey(userId: string, idempotencyKey: string): Promise<Circle | null> {
    await roundTrip();
    for (const [id, stored] of this.circles) {
      if (
        stored.memberships.some(
          (member) => member.userId === userId && member.idempotencyKey === idempotencyKey,
        )
      ) {
        return Circle.restore({ id, ...stored });
      }
    }
    return null;
  }

  /** Mismo criterio que el adaptador de PostgreSQL; el orden de alta es el de inserción. */
  async findOldestJoinable(criteria: JoinableCircleCriteria): Promise<Circle | null> {
    await roundTrip();
    for (const [id, stored] of this.circles) {
      const circle = Circle.restore({ id, ...stored });
      const { terms } = circle;
      if (
        terms.payout.equals(criteria.payout) &&
        terms.months === criteria.months &&
        terms.startsOn.isAfter(criteria.startsAfter) &&
        circle.status === 'open' &&
        !circle.isMember(criteria.userId)
      ) {
        return circle;
      }
    }
    return null;
  }

  async listJoinable(criteria: OpenCirclesCriteria): Promise<Circle[]> {
    await roundTrip();
    return [...this.circles]
      .map(([id, stored]) => Circle.restore({ id, ...stored }))
      .filter(
        (circle) =>
          circle.terms.startsOn.isAfter(criteria.startsAfter) &&
          circle.status === 'open' &&
          !circle.isMember(criteria.userId),
      )
      .slice(0, criteria.limit);
  }

  async addMembership(circleId: string, membership: Membership): Promise<void> {
    await roundTrip();
    // Sin await entre la comprobación y la inserción: es atómico, como una transacción.
    const stored = this.circles.get(circleId);
    if (!stored) throw new Error('Círculo inexistente');
    const { memberships } = stored;
    if (
      memberships.some(({ idempotencyKey }) => idempotencyKey === membership.idempotencyKey) ||
      this.usedKey(membership)
    ) {
      throw new IdempotencyKeyExistsError();
    }
    if (memberships.some(({ position }) => position === membership.position)) {
      throw new SlotTakenError();
    }
    if (memberships.some(({ userId }) => userId === membership.userId)) {
      throw new AlreadyMemberError();
    }
    memberships.push({ ...membership });
    this.recordJoin(circleId, membership.userId);
  }

  async create(circle: Circle): Promise<void> {
    await roundTrip();
    if (circle.memberships.some((membership) => this.usedKey(membership))) {
      throw new IdempotencyKeyExistsError();
    }
    this.add(circle);
  }

  /** Índice único (usuario, clave) en todos los círculos. */
  private usedKey({ userId, idempotencyKey }: Membership): boolean {
    return [...this.circles.values()].some(({ memberships }) =>
      memberships.some(
        (member) => member.userId === userId && member.idempotencyKey === idempotencyKey,
      ),
    );
  }

  /** Marca el ciclo del círculo como terminado. */
  finish(circleId: string): void {
    this.finished.add(circleId);
  }

  expel(circleId: string, userId: string): void {
    this.expelled.add(`${circleId}:${userId}`);
  }

  get size(): number {
    return this.circles.size;
  }

  membershipsOf(circleId: string): Membership[] {
    return [...(this.circles.get(circleId)?.memberships ?? [])];
  }
}
