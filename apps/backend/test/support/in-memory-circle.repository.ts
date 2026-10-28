import { type CircleRepositoryPort } from '@src/modules/circles/application/ports/circle-repository.port';
import { IdempotencyKeyExistsError } from '@src/modules/circles/application/ports/circle-repository.port';
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

  add(circle: Circle): void {
    this.circles.set(circle.id, { terms: circle.terms, memberships: [...circle.memberships] });
  }

  async findById(id: string): Promise<Circle | null> {
    await roundTrip();
    const stored = this.circles.get(id);
    return stored ? Circle.restore({ id, ...stored }) : null;
  }

  async addMembership(circleId: string, membership: Membership): Promise<void> {
    await roundTrip();
    // Sin await entre la comprobación y la inserción: es atómico, como una transacción.
    const stored = this.circles.get(circleId);
    if (!stored) throw new Error('Círculo inexistente');
    const { memberships } = stored;
    if (memberships.some(({ idempotencyKey }) => idempotencyKey === membership.idempotencyKey)) {
      throw new IdempotencyKeyExistsError();
    }
    if (memberships.some(({ position }) => position === membership.position)) {
      throw new SlotTakenError();
    }
    if (memberships.some(({ userId }) => userId === membership.userId)) {
      throw new AlreadyMemberError();
    }
    memberships.push({ ...membership });
  }

  membershipsOf(circleId: string): Membership[] {
    return [...(this.circles.get(circleId)?.memberships ?? [])];
  }
}
