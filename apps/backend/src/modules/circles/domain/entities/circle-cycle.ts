import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { DomainError } from '../../../../shared/errors/app-error';
import { type SlotQuote } from '../services/slot-pricing';
import { type CircleTerms } from '../value-objects/circle-terms';

/**
 * Estados que se guardan. Los pasos Checking, Setting Receiver, Distributing y Distributed del
 * workflow ROSCA (pending-scope §3.1) ocurren juntos al cerrar un mes (`closePeriod`).
 */
export const CYCLE_STATES = ['collecting', 'contributing', 'finished', 'paused'] as const;
export type CycleState = (typeof CYCLE_STATES)[number];

/**
 * `overdue`: el cobro falló y la cuota sigue en gracia. `defaulted`: no se pagó en la gracia y el
 * miembro fue expulsado; la cubre el fondo de garantía (COPAYNI-58).
 */
export const INSTALLMENT_STATUSES = ['pending', 'paid', 'overdue', 'defaulted'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

/** Reglas de impago del PO (pending-scope R3 y R18, §3.1), parametrizables. */
export interface DelinquencyPolicy {
  /** Días corridos después del vencimiento en que todavía se puede pagar. */
  graceDays: number;
  /** Cargo por mora sobre la cuota vencida, cobrado una vez. */
  lateFeeBps: number;
  /** Penalidad sobre lo pagado que se descuenta de la devolución al expulsado. */
  refundPenaltyBps: number;
}

export type CollectionOutcome = 'paid' | 'failed';

export interface Installment {
  readonly id: string;
  readonly userId: string;
  readonly position: number;
  readonly period: Period;
  readonly dueOn: LocalDate;
  readonly amount: Money;
  readonly status: InstallmentStatus;
}

export interface CycleMember {
  readonly userId: string;
  readonly position: number;
  /** Precio del slot: el congelado al unirse o el de las reglas vigentes (`SlotPricing.quoteOf`). */
  readonly quote: SlotQuote;
}

/** Payout de un mes al miembro que tiene ese turno. */
export interface Disbursement {
  readonly period: Period;
  readonly userId: string;
  readonly position: number;
  readonly amount: Money;
}

/** Expulsión por impago (COPAYNI-57): lo que el expulsado debe y lo que se le devuelve. */
export interface Expulsion {
  readonly userId: string;
  readonly position: number;
  /** Mes de la cuota impaga. */
  readonly period: Period;
  readonly expelledOn: LocalDate;
  /**
   * Lo vencido: la cuota impaga o, si ya cobró su payout, todas sus cuotas desde ese mes hasta
   * el final del círculo. Sin el cargo por mora.
   */
  readonly overdue: Money;
  readonly lateFee: Money;
  /** Lo pagado menos la penalidad, a devolver al cerrar el círculo; `null` si ya cobró. */
  readonly refund: Money | null;
}

export class InvalidCycleTransitionError extends DomainError {
  constructor(message: string) {
    super('INVALID_CYCLE_TRANSITION', message);
  }
}

/**
 * Ciclo mensual de un Game'ya (COPAYNI-56, workflow ROSCA del PO):
 * `collecting` → cada mes `contributing` (cobro de cuotas) → cierre del mes (quién cobra y
 * payout) → `finished` después del último mes. `paused` detiene el ciclo (COPAYNI-61).
 *
 * Un mes se cierra cuando todas sus cuotas están pagadas o incobrables. Una cuota cuyo cobro
 * falló queda `overdue`; si sigue impaga al terminar la gracia, el miembro es expulsado
 * (COPAYNI-57): su cuota pasa a `defaulted`, sale del ciclo y su turno queda libre. La cobertura
 * del fondo llega con COPAYNI-58 y el reemplazo del turno con COPAYNI-59.
 */
export class CircleCycle {
  private constructor(
    readonly circleId: string,
    readonly terms: CircleTerms,
    /** Día del mes en que vence cada cuota (pending-scope R19). */
    private readonly dueDay: number,
    private readonly delinquency: DelinquencyPolicy,
    private currentState: CycleState,
    private period: Period | null,
    private readonly active: CycleMember[],
    private readonly touched: Installment[],
    private readonly payouts: Disbursement[],
    private readonly expelled: Expulsion[],
  ) {}

  /** `members`: los no expulsados. `installments`: las del mes en curso. */
  static restore(props: {
    circleId: string;
    terms: CircleTerms;
    dueDay: number;
    delinquency: DelinquencyPolicy;
    state: CycleState;
    currentPeriod: Period | null;
    members: readonly CycleMember[];
    installments: readonly Installment[];
  }): CircleCycle {
    const { circleId, terms, dueDay, delinquency, state, currentPeriod, members, installments } =
      props;
    const notRunning = state === 'collecting' || state === 'finished';
    if ((state === 'contributing' && currentPeriod === null) || (notRunning && currentPeriod)) {
      throw new InvalidCycleTransitionError('Solo un círculo en curso tiene un mes en curso');
    }
    return new CircleCycle(
      circleId,
      terms,
      dueDay,
      delinquency,
      state,
      currentPeriod,
      [...members],
      [...installments],
      [],
      [],
    );
  }

  /** Miembros que siguen en el ciclo. */
  get members(): readonly CycleMember[] {
    return [...this.active];
  }

  get state(): CycleState {
    return this.currentState;
  }

  isFinished(): boolean {
    return this.currentState === 'finished';
  }

  get currentPeriod(): Period | null {
    return this.period;
  }

  /** Las cuotas del mes en curso y las que se abrieron o cambiaron desde `restore`. */
  get installments(): readonly Installment[] {
    return [...this.touched];
  }

  /** Payouts decididos desde `restore`. */
  get disbursements(): readonly Disbursement[] {
    return [...this.payouts];
  }

  /** Expulsiones decididas desde `restore`. */
  get expulsions(): readonly Expulsion[] {
    return [...this.expelled];
  }

  /** Llegó el mes de inicio y el círculo todavía no empezó. */
  isStartDue(today: LocalDate): boolean {
    return this.currentState === 'collecting' && !this.terms.startsOn.isAfter(today.period);
  }

  /** Collecting → Contributing: abre las cuotas del primer mes. */
  start(newId: () => string): void {
    if (this.currentState !== 'collecting') {
      throw new InvalidCycleTransitionError('Solo empieza un círculo que está reuniendo miembros');
    }
    this.currentState = 'contributing';
    this.openPeriod(this.terms.startsOn, newId);
  }

  /** Cuotas del mes en curso que vencieron hasta `today` y todavía se cobran. */
  dueInstallments(today: LocalDate): Installment[] {
    if (this.currentState !== 'contributing') return [];
    return this.touched.filter(
      (installment) =>
        installment.period.equals(this.period!) &&
        (installment.status === 'pending' || installment.status === 'overdue') &&
        !installment.dueOn.isAfter(today),
    );
  }

  recordCollection(installmentId: string, outcome: CollectionOutcome): Installment {
    const index = this.touched.findIndex(({ id }) => id === installmentId);
    const installment = this.touched[index];
    if (!installment || installment.status === 'paid' || installment.status === 'defaulted') {
      throw new InvalidCycleTransitionError('La cuota no existe o ya no se cobra');
    }
    const updated = { ...installment, status: outcome === 'paid' ? 'paid' : 'overdue' } as const;
    this.touched[index] = updated;
    return updated;
  }

  /**
   * Cuotas del mes en curso cuyo cobro falló y cuya gracia terminó antes de `today`: con
   * vencimiento el día 1 y 3 días de gracia, el último día para pagar es el 4 y se expulsa el 5.
   * Una cuota que nunca se intentó cobrar (`pending`, p. ej. si la tarea no corrió) no cuenta.
   */
  defaultedInstallments(today: LocalDate): Installment[] {
    if (this.currentState !== 'contributing') return [];
    return this.touched.filter(
      (installment) =>
        installment.period.equals(this.period!) &&
        installment.status === 'overdue' &&
        today.isAfter(installment.dueOn.addDays(this.delinquency.graceDays)),
    );
  }

  /**
   * Expulsa al miembro de una cuota impaga después de la gracia (pending-scope §3.1): la cuota
   * pasa a `defaulted` y el miembro sale del ciclo, así que no se le abren más cuotas y su turno,
   * si no cobró, queda libre.
   * - Debe lo vencido más el cargo por mora; si ya cobró, también sus cuotas restantes.
   * - Si no cobró, se le devuelve lo pagado menos la penalidad al cerrar el círculo.
   */
  expel(installmentId: string, today: LocalDate): Expulsion {
    const installment = this.defaultedInstallments(today).find(({ id }) => id === installmentId);
    const member = this.active.find(({ userId }) => userId === installment?.userId);
    if (!installment || !member) {
      throw new InvalidCycleTransitionError('La cuota no está impaga después de la gracia');
    }
    const month = this.terms.startsOn.monthsUntil(installment.period);
    const sum = (amounts: readonly Money[]): Money =>
      amounts.reduce((total, amount) => total.add(amount), Money.zero(this.terms.currency));
    // Los meses anteriores cerraron con todas sus cuotas pagadas: cobró si su turno ya pasó.
    const alreadyPaidOut = member.position <= month;
    const paid = sum(member.quote.installments.slice(0, month));
    const expulsion: Expulsion = {
      userId: member.userId,
      position: member.position,
      period: installment.period,
      expelledOn: today,
      overdue: alreadyPaidOut ? sum(member.quote.installments.slice(month)) : installment.amount,
      lateFee: installment.amount.percentage(this.delinquency.lateFeeBps),
      refund: alreadyPaidOut
        ? null
        : paid.subtract(paid.percentage(this.delinquency.refundPenaltyBps)),
    };

    this.touched[this.touched.indexOf(installment)] = { ...installment, status: 'defaulted' };
    this.active.splice(this.active.indexOf(member), 1);
    this.expelled.push(expulsion);
    return expulsion;
  }

  /**
   * El mes en curso ya venció y todas sus cuotas están pagadas o incobrables (`defaulted`). Sin la
   * fecha, un círculo sin miembros cerraría todos sus meses de una vez.
   */
  isPeriodSettled(today: LocalDate): boolean {
    return (
      this.currentState === 'contributing' &&
      !LocalDate.of(this.period!, this.dueDay).isAfter(today) &&
      this.touched
        .filter(({ period }) => period.equals(this.period!))
        .every(({ status }) => status === 'paid' || status === 'defaulted')
    );
  }

  /** Quien tiene el turno del mes en curso, o `undefined` si ese turno está libre. */
  receiver(): CycleMember | undefined {
    if (this.period === null) return undefined;
    const position = this.terms.startsOn.monthsUntil(this.period) + 1;
    return this.active.find((member) => member.position === position);
  }

  /**
   * Checking → Setting Receiver → Distributing → Distributed: decide el payout del mes y pasa al
   * mes siguiente, o termina después del último. Devuelve `null` si el turno del mes está libre.
   */
  closePeriod(today: LocalDate, newId: () => string): Disbursement | null {
    if (!this.isPeriodSettled(today)) {
      throw new InvalidCycleTransitionError('El mes tiene cuotas sin pagar ni expulsión');
    }
    const period = this.period!;
    const receiver = this.receiver();
    const disbursement = receiver
      ? {
          period,
          userId: receiver.userId,
          position: receiver.position,
          amount: receiver.quote.netPayout,
        }
      : null;
    if (disbursement) this.payouts.push(disbursement);

    if (period.equals(this.terms.endsOn)) {
      this.currentState = 'finished';
      this.period = null;
    } else {
      this.openPeriod(period.addMonths(1), newId);
    }
    return disbursement;
  }

  private openPeriod(period: Period, newId: () => string): void {
    this.period = period;
    const month = this.terms.startsOn.monthsUntil(period);
    for (const { userId, position, quote } of this.active) {
      this.touched.push({
        id: newId(),
        userId,
        position,
        period,
        dueOn: LocalDate.of(period, this.dueDay),
        amount: quote.installments[month]!,
        status: 'pending',
      });
    }
  }
}
