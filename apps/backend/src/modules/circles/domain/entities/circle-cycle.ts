import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Money } from '../../../../shared/domain/value-objects/money';
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

export const INSTALLMENT_STATUSES = ['pending', 'paid', 'overdue'] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

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
 * Un mes se cierra solo cuando todas sus cuotas están pagadas. Las vencidas quedan `overdue`; la
 * gracia, la expulsión y la cobertura del fondo llegan con COPAYNI-57 y COPAYNI-58.
 */
export class CircleCycle {
  private constructor(
    readonly circleId: string,
    readonly terms: CircleTerms,
    /** Día del mes en que vence cada cuota (pending-scope R19). */
    private readonly dueDay: number,
    private currentState: CycleState,
    private period: Period | null,
    readonly members: readonly CycleMember[],
    private readonly touched: Installment[],
    private readonly payouts: Disbursement[],
  ) {}

  /** `installments`: las del mes en curso. */
  static restore(props: {
    circleId: string;
    terms: CircleTerms;
    dueDay: number;
    state: CycleState;
    currentPeriod: Period | null;
    members: readonly CycleMember[];
    installments: readonly Installment[];
  }): CircleCycle {
    const { circleId, terms, dueDay, state, currentPeriod, members, installments } = props;
    const notRunning = state === 'collecting' || state === 'finished';
    if ((state === 'contributing' && currentPeriod === null) || (notRunning && currentPeriod)) {
      throw new InvalidCycleTransitionError('Solo un círculo en curso tiene un mes en curso');
    }
    return new CircleCycle(
      circleId,
      terms,
      dueDay,
      state,
      currentPeriod,
      [...members],
      [...installments],
      [],
    );
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

  /** Cuotas del mes en curso que vencieron hasta `today` y no están pagadas. */
  dueInstallments(today: LocalDate): Installment[] {
    if (this.currentState !== 'contributing') return [];
    return this.touched.filter(
      (installment) =>
        installment.period.equals(this.period!) &&
        installment.status !== 'paid' &&
        !installment.dueOn.isAfter(today),
    );
  }

  recordCollection(installmentId: string, outcome: CollectionOutcome): Installment {
    const index = this.touched.findIndex(({ id }) => id === installmentId);
    const installment = this.touched[index];
    if (!installment || installment.status === 'paid') {
      throw new InvalidCycleTransitionError('La cuota no existe o ya está pagada');
    }
    const updated = { ...installment, status: outcome === 'paid' ? 'paid' : 'overdue' } as const;
    this.touched[index] = updated;
    return updated;
  }

  /**
   * El mes en curso ya venció y todas sus cuotas están pagadas. Sin la fecha, un círculo sin
   * miembros cerraría todos sus meses de una vez.
   */
  isPeriodSettled(today: LocalDate): boolean {
    return (
      this.currentState === 'contributing' &&
      !LocalDate.of(this.period!, this.dueDay).isAfter(today) &&
      this.touched
        .filter(({ period }) => period.equals(this.period!))
        .every(({ status }) => status === 'paid')
    );
  }

  /** Quien tiene el turno del mes en curso, o `undefined` si ese turno está libre. */
  receiver(): CycleMember | undefined {
    if (this.period === null) return undefined;
    const position = this.terms.startsOn.monthsUntil(this.period) + 1;
    return this.members.find((member) => member.position === position);
  }

  /**
   * Checking → Setting Receiver → Distributing → Distributed: decide el payout del mes y pasa al
   * mes siguiente, o termina después del último. Devuelve `null` si el turno del mes está libre.
   */
  closePeriod(today: LocalDate, newId: () => string): Disbursement | null {
    if (!this.isPeriodSettled(today)) {
      throw new InvalidCycleTransitionError('El mes tiene cuotas sin pagar');
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
    for (const { userId, position, quote } of this.members) {
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
