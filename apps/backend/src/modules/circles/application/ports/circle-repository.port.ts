import { type Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { type Circle, type Membership } from '../../domain/entities/circle';

export const CIRCLE_REPOSITORY = Symbol('CIRCLE_REPOSITORY');

/**
 * Ya existe una membresía con esa clave de idempotencia (otra solicitud con la misma clave
 * ganó la carrera). No es un error para el cliente: el caso de uso relee y responde con ella.
 */
export class IdempotencyKeyExistsError extends Error {
  constructor() {
    super('Ya existe una membresía con esa clave de idempotencia');
  }
}

/** Círculos a los que un usuario todavía puede unirse con esas condiciones. */
export interface JoinableCircleCriteria {
  payout: Money;
  months: number;
  /** Solo círculos que empiezan después de este mes: en uno ya iniciado, el primer cobro pasó. */
  startsAfter: Period;
  /** Excluye los círculos donde el usuario ya es miembro (un slot por usuario). */
  userId: string;
}

export interface CircleRepositoryPort {
  findById(id: string): Promise<Circle | null>;
  /** El más antiguo (por alta) que cumple los criterios y no está lleno, o `null`. */
  findOldestJoinable(criteria: JoinableCircleCriteria): Promise<Circle | null>;
  /**
   * Inserta la membresía de forma atómica. El círculo se validó con una lectura que pudo
   * quedar vieja, así que el almacenamiento es la barrera final, con unicidad por
   * (círculo, slot), (círculo, usuario) y (círculo, clave). En PostgreSQL (COPAYNI-12) son
   * índices únicos: solo chocan las solicitudes que compiten por lo mismo.
   *
   * Si otra solicitud ganó, rechaza con SlotTakenError, AlreadyMemberError o
   * IdempotencyKeyExistsError.
   */
  addMembership(circleId: string, membership: Membership): Promise<void>;
}
