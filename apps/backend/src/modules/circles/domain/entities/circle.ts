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

export class CircleAlreadyStartedError extends ConflictError {
  constructor() {
    super('CIRCLE_ALREADY_STARTED', 'El círculo ya empezó: elige otro turno');
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

/** Turnos que se pueden tomar en un círculo que ya empezó (COPAYNI-59). */
export interface RunningCircle {
  /**
   * Turnos vacantes: los de expulsados que todavía no cobraron (pending-scope §3.1, R17). Si la
   * vacante sigue abierta depende de la fecha (`vacancyJoinMonth`).
   */
  vacancies: readonly number[];
}

/**
 * Agregado de un Game'ya: sus condiciones y quién tiene cada slot. Garantiza que un slot
 * tiene un solo miembro, que un usuario tiene un solo slot y que unirse es idempotente.
 *
 * Valida contra el estado leído; la barrera ante solicitudes simultáneas es la inserción
 * atómica del repositorio (CircleRepositoryPort.addMembership).
 *
 * Un círculo que ya empezó solo admite miembros en los turnos vacantes de los expulsados
 * (COPAYNI-59). Las membresías son las de quienes siguen en el círculo.
 *
 * Fuera de este alcance (pending-scope R2): cómo se forman los círculos.
 */
export class Circle {
  private constructor(
    readonly id: string,
    readonly terms: CircleTerms,
    private readonly members: Membership[],
    /** `null` si el círculo todavía no empezó. */
    private runningState: RunningCircle | null,
  ) {}

  static open(props: { id: string; terms: CircleTerms }): Circle {
    return Circle.restore({ ...props, memberships: [] });
  }

  /** Reconstruye un círculo guardado, verificando sus invariantes. */
  static restore(props: {
    id: string;
    terms: CircleTerms;
    memberships: readonly Membership[];
    running?: RunningCircle | null;
  }): Circle {
    const { id, terms, memberships } = props;
    const running = props.running ?? null;
    if (!id.trim()) throw new InvalidCircleError('El círculo necesita un id');
    const unique = (values: unknown[]): boolean => new Set(values).size === values.length;
    if (
      memberships.some(({ position }) => position < 1 || position > terms.months) ||
      !unique(memberships.map(({ position }) => position)) ||
      !unique(memberships.map(({ userId }) => userId)) ||
      !unique(memberships.map(({ idempotencyKey }) => idempotencyKey)) ||
      memberships.some(({ price }) => price && !Circle.fitsTerms(price, terms)) ||
      running?.vacancies.some(
        (position) =>
          position < 1 ||
          position > terms.months ||
          memberships.some((member) => member.position === position),
      )
    ) {
      throw new InvalidCircleError('Las membresías guardadas no son consistentes');
    }
    return new Circle(
      id,
      terms,
      memberships.map((membership) => ({ ...membership })),
      running && { vacancies: [...running.vacancies] },
    );
  }

  /** Una cuota por mes, todo en la moneda del círculo. */
  private static fitsTerms(price: SlotPrice, terms: CircleTerms): boolean {
    const { fee, discount, adminFee, netPayout, installments, catchUp = [] } = price;
    return (
      installments.length === terms.months &&
      (catchUp.length === 0 || catchUp.length === terms.months) &&
      [fee, discount, adminFee, netPayout, ...installments, ...catchUp].every(
        (money) => money.currency === terms.currency,
      )
    );
  }

  /** `null` si el círculo todavía no empezó. */
  get running(): RunningCircle | null {
    return this.runningState && { vacancies: [...this.runningState.vacancies] };
  }

  get memberships(): readonly Membership[] {
    return this.members;
  }

  /** Un círculo en curso está `open` mientras tenga vacantes. */
  get status(): CircleStatus {
    if (this.runningState) return this.runningState.vacancies.length > 0 ? 'open' : 'full';
    return this.members.length === this.terms.months ? 'full' : 'open';
  }

  isRunning(): boolean {
    return this.runningState !== null;
  }

  isMember(userId: string): boolean {
    return this.members.some((member) => member.userId === userId);
  }

  isTaken(position: number): boolean {
    return this.members.some((member) => member.position === position);
  }

  /** Los turnos libres; en un círculo en curso, sus vacantes. */
  availablePositions(): number[] {
    if (this.runningState) return [...this.runningState.vacancies].sort((a, b) => a - b);
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
    if (!this.availablePositions().includes(position)) throw new SlotTakenError();
    if (price && !Circle.fitsTerms(price, this.terms)) {
      throw new InvalidCircleError(
        'El precio del slot no corresponde a las condiciones del círculo',
      );
    }

    const membership: Membership = { userId, position, idempotencyKey, ...(price && { price }) };
    this.members.push(membership);
    if (this.runningState) {
      this.runningState = {
        vacancies: this.runningState.vacancies.filter((vacancy) => vacancy !== position),
      };
    }
    return { membership: { ...membership }, created: true };
  }
}
