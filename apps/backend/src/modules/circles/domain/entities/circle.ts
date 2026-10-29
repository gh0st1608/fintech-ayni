import { ConflictError, DomainError } from '../../../../shared/errors/app-error';
import { SlotOutOfRangeError, type SlotPrice } from '../services/slot-pricing';
import { type CircleTerms } from '../value-objects/circle-terms';

export class SlotTakenError extends ConflictError {
  constructor() {
    super('SLOT_TAKEN', 'Ese turno ya fue tomado por otro miembro');
  }
}

export class AlreadyMemberError extends ConflictError {
  constructor() {
    super('ALREADY_MEMBER', 'Ya eres miembro de este círculo');
  }
}

export class IdempotencyKeyReusedError extends ConflictError {
  constructor() {
    super('IDEMPOTENCY_KEY_REUSED', 'La clave de idempotencia ya se usó con otros datos');
  }
}

export class InvalidCircleError extends DomainError {
  constructor(message: string) {
    super('INVALID_CIRCLE', message);
  }
}

export interface Membership {
  readonly userId: string;
  /** Slot reservado: 1 = cobra el primer mes. */
  readonly position: number;
  /** Clave que envía el cliente al unirse; reintentar con la misma no crea otra membresía. */
  readonly idempotencyKey: string;
  /**
   * Precio del slot congelado al unirse (COPAYNI-55). Solo falta en las membresías anteriores,
   * que se cotizan con las reglas vigentes (`SlotPricing.quoteOf`).
   */
  readonly price?: SlotPrice;
}

export interface JoinResult {
  membership: Membership;
  /** false si la unión ya existía con la misma clave (reintento). */
  created: boolean;
}

export type CircleStatus = 'open' | 'full';

/**
 * Agregado de un Game'ya: sus condiciones y quién tiene cada slot. Garantiza que un slot
 * tiene un solo miembro, que un usuario tiene un solo slot y que unirse es idempotente.
 *
 * Valida contra el estado leído; la barrera ante solicitudes simultáneas es la inserción
 * atómica del repositorio (CircleRepositoryPort.addMembership).
 *
 * Fuera de este alcance (pending-scope R2 y R3): cómo se forman los círculos, qué pasa si no
 * se llenan, y la mora.
 */
export class Circle {
  private constructor(
    readonly id: string,
    readonly terms: CircleTerms,
    private readonly members: Membership[],
  ) {}

  static open(props: { id: string; terms: CircleTerms }): Circle {
    return Circle.restore({ ...props, memberships: [] });
  }

  /** Reconstruye un círculo guardado, verificando sus invariantes. */
  static restore(props: {
    id: string;
    terms: CircleTerms;
    memberships: readonly Membership[];
  }): Circle {
    const { id, terms, memberships } = props;
    if (!id.trim()) throw new InvalidCircleError('El círculo necesita un id');
    const unique = (values: unknown[]): boolean => new Set(values).size === values.length;
    if (
      memberships.some(({ position }) => position < 1 || position > terms.months) ||
      !unique(memberships.map(({ position }) => position)) ||
      !unique(memberships.map(({ userId }) => userId)) ||
      !unique(memberships.map(({ idempotencyKey }) => idempotencyKey)) ||
      memberships.some(({ price }) => price && !Circle.fitsTerms(price, terms))
    ) {
      throw new InvalidCircleError('Las membresías guardadas no son consistentes');
    }
    return new Circle(
      id,
      terms,
      memberships.map((membership) => ({ ...membership })),
    );
  }

  /** Una cuota por mes, todo en la moneda del círculo. */
  private static fitsTerms(price: SlotPrice, terms: CircleTerms): boolean {
    const { fee, discount, adminFee, netPayout, installments } = price;
    return (
      installments.length === terms.months &&
      [fee, discount, adminFee, netPayout, ...installments].every(
        (money) => money.currency === terms.currency,
      )
    );
  }

  get memberships(): readonly Membership[] {
    return this.members;
  }

  get status(): CircleStatus {
    return this.members.length === this.terms.months ? 'full' : 'open';
  }

  isMember(userId: string): boolean {
    return this.members.some((member) => member.userId === userId);
  }

  isTaken(position: number): boolean {
    return this.members.some((member) => member.position === position);
  }

  availablePositions(): number[] {
    const taken = new Set(this.members.map(({ position }) => position));
    return Array.from({ length: this.terms.months }, (_, index) => index + 1).filter(
      (position) => !taken.has(position),
    );
  }

  join(request: Membership): JoinResult {
    const { userId, position, idempotencyKey, price } = request;
    const previous = this.members.find((member) => member.idempotencyKey === idempotencyKey);
    if (previous) {
      if (previous.userId !== userId || previous.position !== position) {
        throw new IdempotencyKeyReusedError();
      }
      return { membership: { ...previous }, created: false };
    }
    if (!Number.isInteger(position) || position < 1 || position > this.terms.months) {
      throw new SlotOutOfRangeError(this.terms.months);
    }
    if (this.members.some((member) => member.userId === userId)) throw new AlreadyMemberError();
    if (this.members.some((member) => member.position === position)) throw new SlotTakenError();
    if (price && !Circle.fitsTerms(price, this.terms)) {
      throw new InvalidCircleError(
        'El precio del slot no corresponde a las condiciones del círculo',
      );
    }

    const membership: Membership = { userId, position, idempotencyKey, ...(price && { price }) };
    this.members.push(membership);
    return { membership: { ...membership }, created: true };
  }
}
