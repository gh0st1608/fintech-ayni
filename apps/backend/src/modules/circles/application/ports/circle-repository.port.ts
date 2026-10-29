import { type Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { ValidationError } from '../../../../shared/errors/app-error';
import { type Circle, type Membership } from '../../domain/entities/circle';
import { type CircleTerms } from '../../domain/value-objects/circle-terms';

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

/** Círculos recomendados (COPAYNI-25): los que admiten al usuario, sin filtrar condiciones. */
export interface OpenCirclesCriteria {
  startsAfter: Period;
  userId: string;
  limit: number;
}

export type MembershipStatus = 'active' | 'finished';

/** Mis círculos (COPAYNI-26): las membresías del usuario, de la más reciente a la más antigua. */
export interface MembershipsQuery {
  userId: string;
  /** `finished`: el último mes del círculo es anterior a `currentPeriod`. */
  status: MembershipStatus;
  currentPeriod: Period;
  limit: number;
  /** Cursor opaco de la página anterior (`nextCursor`), o `null` para la primera. */
  cursor: string | null;
}

export interface MemberCircle {
  circleId: string;
  terms: CircleTerms;
  position: number;
  joinedAt: Date;
}

export interface MembershipPage {
  items: MemberCircle[];
  /** `null` si no hay más páginas. */
  nextCursor: string | null;
}

/** El cursor no lo generó este repositorio o está dañado. */
export class InvalidCursorError extends ValidationError {
  constructor() {
    super('El cursor no es válido', { cursor: 'invalid' });
  }
}

export interface CircleRepositoryPort {
  /** Rechaza un cursor ajeno con InvalidCursorError. */
  listMemberships(query: MembershipsQuery): Promise<MembershipPage>;
  findById(id: string): Promise<Circle | null>;
  /** El círculo donde el usuario se unió con esa clave de idempotencia, o `null`. */
  findByMembershipKey(userId: string, idempotencyKey: string): Promise<Circle | null>;
  /** El más antiguo (por alta) que cumple los criterios y no está lleno, o `null`. */
  findOldestJoinable(criteria: JoinableCircleCriteria): Promise<Circle | null>;
  /** Hasta `limit` círculos que admiten al usuario, del más antiguo al más nuevo. */
  listJoinable(criteria: OpenCirclesCriteria): Promise<Circle[]>;
  /**
   * Inserta la membresía de forma atómica. El círculo se validó con una lectura que pudo
   * quedar vieja, así que el almacenamiento es la barrera final, con unicidad por
   * (círculo, slot), (círculo, usuario) y (círculo, clave). En PostgreSQL (COPAYNI-12) son
   * índices únicos: solo chocan las solicitudes que compiten por lo mismo.
   *
   * Si otra solicitud ganó, rechaza con SlotTakenError, AlreadyMemberError o
   * IdempotencyKeyExistsError. La clave también es única por usuario en todos sus círculos.
   */
  addMembership(circleId: string, membership: Membership): Promise<void>;
  /**
   * Guarda un círculo nuevo con sus membresías en una sola transacción. Si el usuario ya usó la
   * clave (el mismo pedido llegó dos veces), rechaza con IdempotencyKeyExistsError y no queda
   * ningún círculo a medias.
   */
  create(circle: Circle): Promise<void>;
}
