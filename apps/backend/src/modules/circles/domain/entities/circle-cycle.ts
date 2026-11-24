import { type LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { DomainError } from '../../../../shared/errors/app-error';
import { refundTransactions, settlePeriod } from '../services/period-settlement';
import { retainedInstallments, type SlotQuote } from '../services/slot-pricing';
import { TurnSchedule } from '../services/turn-schedule';
import { CircleTerms } from '../value-objects/circle-terms';
import { LedgerTransaction } from '../value-objects/ledger-transaction';

/**
 * Estados que se guardan. Los pasos Checking, Setting Receiver, Distributing y Distributed del
 * workflow ROSCA (pending-scope §3.1) ocurren juntos al cerrar un mes (`closePeriod`). `approving`:
 * no se llenó y sus miembros deciden si empieza reducido (COPAYNI-62). `cancelled`: no empezó y
 * nadie pagó nada.
 */
export const CYCLE_STATES = [
  'collecting',
  'approving',
  'contributing',
  'finished',
  'paused',
  'cancelled',
] as const;
export type CycleState = (typeof CYCLE_STATES)[number];

/**
 * `overdue`: el cobro falló y la cuota sigue en gracia. `defaulted`: no se pagó en la gracia y el
 * miembro fue expulsado; la cubre el fondo de garantía (COPAYNI-58). `retained`: la paga la
 * retención de su payout, sin cobrarse (COPAYNI-60). `deducted`: la de su mes de cobro, que se
 * descuenta del payout porque lo pidió (COPAYNI-38).
 */
export const INSTALLMENT_STATUSES = [
  'pending',
  'paid',
  'overdue',
  'defaulted',
  'retained',
  'deducted',
] as const;
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
  /**
   * Turno al que corresponde la cuota: el ordinal del ciclo (1..N), que es lo que la identifica
   * (COPAYNI-126). El mes no sirve para eso fuera de la cadencia mensual, donde cuatro turnos
   * caen en el mismo mes.
   */
  readonly turn: number;
  /** Mes del turno, para informes y para el contrato público, que habla en `YYYY-MM`. */
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
  /** Descontar la cuota de su mes de cobro del payout (COPAYNI-38). */
  readonly deductPayInFromPayout?: boolean;
}

/** Payout de un turno al miembro que lo tiene. */
export interface Disbursement {
  readonly turn: number;
  /** Mes en que cae el turno, para informes. */
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
  /** Lo que pagó antes de la expulsión; `null` si ya cobró (no hay devolución). */
  readonly paid: Money | null;
  /** Lo pagado menos la penalidad, a devolver al cerrar el círculo; `null` si ya cobró. */
  readonly refund: Money | null;
  /** Su retención, que fue al fondo y ya está descontada de `overdue` (COPAYNI-60). */
  readonly retentionApplied: Money;
}

/** Fondo de garantía (COPAYNI-58): su saldo y la parte de las Admin Fees que recibe. */
export interface CycleFund {
  balance: Money;
  feeShareBps: number;
}

/** Devolución de un expulsado de este círculo que todavía no se pagó. */
export interface PendingRefund {
  readonly userId: string;
  readonly paid: Money;
  readonly refund: Money;
}

/** Devolución que se paga al cerrar el círculo. */
export interface Refund {
  readonly userId: string;
  readonly amount: Money;
}

/** Cómo cerró un mes: lo que cubrió el fondo, lo que no alcanzó y el pozo que volvió. */
export interface PeriodClose {
  readonly period: Period;
  readonly coverage: Money;
  readonly shortfall: Money;
  readonly returned: Money;
}

/** Pausa o reanudación del admin general (COPAYNI-61), para la auditoría. */
export interface CycleAdminEvent {
  readonly action: 'pause' | 'resume';
  readonly actorId: string;
  readonly reason: string;
  readonly on: LocalDate;
  readonly before: CycleSnapshot;
  readonly after: CycleSnapshot;
}

/** Lo que cambia una pausa: estado y calendario. */
export interface CycleSnapshot {
  readonly state: CycleState;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly currentPeriod: string | null;
}

export class InvalidCycleTransitionError extends DomainError {
  constructor(message: string) {
    super('INVALID_CYCLE_TRANSITION', message);
  }
}

/**
 * Ciclo de un Game'ya (COPAYNI-56, workflow ROSCA del PO):
 * `collecting` → cada turno `contributing` (cobro de cuotas) → cierre del turno (quién cobra y
 * payout) → `finished` después del último turno. `paused` detiene el ciclo (COPAYNI-61).
 *
 * **Lo que el ciclo tiene en curso es un turno, no un mes** (COPAYNI-126). El turno es el ordinal
 * del ciclo (1..N) y es quien manda: identifica la cuota, decide quién cobra, da el vencimiento
 * por el cronograma y determina el final. El mes se sigue guardando y mostrando, porque los
 * informes y el contrato público hablan en `YYYY-MM`, pero ya no identifica nada: en una junta
 * semanal de cuatro turnos los cuatro caen en el mismo mes. Mientras la cadencia sea mensual
 * ambos coinciden, y de ahí vienen los nombres en meses que quedan en los informes.
 *
 * Un mes se cierra cuando todas sus cuotas están pagadas o incobrables. Una cuota cuyo cobro
 * falló queda `overdue`; si sigue impaga al terminar la gracia, el miembro es expulsado
 * (COPAYNI-57): su cuota pasa a `defaulted`, sale del ciclo y su turno queda libre. El fondo de
 * garantía cubre esa vacante (COPAYNI-58) hasta que la toma un miembro nuevo (COPAYNI-59), que
 * paga la puesta al día con sus cuotas.
 *
 * Un círculo solo empieza con todos sus turnos ocupados: el fondo no cubre turnos que nunca se
 * llenaron. Si llega el mes de inicio y faltan miembros, el PO decidió reducir el pozo y los
 * integrantes con la aprobación de los miembros (pending-scope R2, COPAYNI-62): el círculo pasa a
 * `approving` y empieza reducido, se vuelve a proponer sin los que salieron o se cancela.
 */
export class CircleCycle {
  private shift = 0;
  private readonly adminLog: CycleAdminEvent[] = [];
  private openedProposal: { terms: CircleTerms; respondBy: LocalDate } | null = null;
  private readonly leaving: string[] = [];
  private reduced = false;

  private constructor(
    readonly circleId: string,
    private currentTerms: CircleTerms,
    /** Día del mes en que vence cada cuota (pending-scope R19). */
    private readonly dueDay: number,
    private readonly delinquency: DelinquencyPolicy,
    private currentState: CycleState,
    /** Turno en curso (1..N); `null` si el círculo no está en curso. */
    private turn: number | null,
    private readonly active: CycleMember[],
    private readonly touched: Installment[],
    private readonly payouts: Disbursement[],
    private readonly expelled: Expulsion[],
    private fundBalance: Money,
    private readonly feeShareBps: number,
    private readonly pendingRefunds: readonly PendingRefund[],
    private readonly entries: LedgerTransaction[],
    private readonly closes: PeriodClose[],
    private readonly refundsToPay: Refund[],
    private pausedSince: LocalDate | null,
  ) {}

  get terms(): CircleTerms {
    return this.currentTerms;
  }

  /** Desde cuándo está pausado; `null` si no lo está. */
  get pausedOn(): LocalDate | null {
    return this.pausedSince;
  }

  /** Meses que se corrió el calendario desde `restore` al reanudar (COPAYNI-61). */
  get calendarShift(): number {
    return this.shift;
  }

  /** Propuesta abierta desde `restore`, para guardarla (COPAYNI-62). */
  get startProposal(): { terms: CircleTerms; respondBy: LocalDate } | null {
    return this.openedProposal;
  }

  /** Miembros que salieron antes de empezar, desde `restore`. */
  get withdrawnMembers(): readonly string[] {
    return [...this.leaving];
  }

  /** Si empezó con condiciones reducidas: hay que guardar sus turnos y precios nuevos. */
  get startedReduced(): boolean {
    return this.reduced;
  }

  /** Pausas y reanudaciones desde `restore`. */
  get adminEvents(): readonly CycleAdminEvent[] {
    return [...this.adminLog];
  }

  /**
   * `members`: los no expulsados. `installments`: las del turno en curso. `pendingRefunds`: las
   * devoluciones de los expulsados de este círculo que todavía no se pagaron.
   *
   * `currentTurn` es el turno en curso tal como se guardó. Mientras la base de datos no lo tenga
   * escrito (expansión, COPAYNI-107), se deriva del mes en curso contando meses desde el
   * arranque, que es exactamente lo que hace el backfill de esa migración: así un círculo mensual
   * guardado antes de este cambio se restaura idéntico, sin leer una columna que todavía puede
   * estar vacía.
   */
  static restore(props: {
    circleId: string;
    terms: CircleTerms;
    dueDay: number;
    delinquency: DelinquencyPolicy;
    fund: CycleFund;
    state: CycleState;
    currentPeriod: Period | null;
    currentTurn?: number | null;
    members: readonly CycleMember[];
    installments: readonly Installment[];
    pendingRefunds?: readonly PendingRefund[];
    pausedOn?: LocalDate | null;
  }): CircleCycle {
    const { circleId, terms, dueDay, delinquency, state, currentPeriod, members, installments } =
      props;
    if (!props.fund.balance.hasSameCurrency(terms.payout)) {
      throw new InvalidCycleTransitionError('El fondo debe estar en la moneda del círculo');
    }
    const notRunning = ['collecting', 'approving', 'finished', 'cancelled'].includes(state);
    const running = state === 'contributing' || state === 'paused';
    if ((running && currentPeriod === null) || (notRunning && currentPeriod)) {
      throw new InvalidCycleTransitionError('Solo un círculo en curso tiene un turno en curso');
    }
    const turn =
      props.currentTurn ??
      (currentPeriod ? terms.startsOnPeriod.monthsUntil(currentPeriod) + 1 : null);
    if (turn !== null && (!Number.isInteger(turn) || turn < 1 || turn > terms.turns)) {
      throw new InvalidCycleTransitionError(
        `El turno en curso debe estar entre 1 y ${terms.turns}, y no ${turn}`,
      );
    }
    if ((state === 'paused') !== Boolean(props.pausedOn)) {
      throw new InvalidCycleTransitionError('Solo un círculo pausado tiene fecha de pausa');
    }
    return new CircleCycle(
      circleId,
      terms,
      dueDay,
      delinquency,
      state,
      turn,
      [...members],
      [...installments],
      [],
      [],
      props.fund.balance,
      props.fund.feeShareBps,
      [...(props.pendingRefunds ?? [])],
      [],
      [],
      [],
      props.pausedOn ?? null,
    );
  }

  /**
   * Pausa el ciclo (COPAYNI-61, solo el admin general): mientras dura no corren vencimientos,
   * cobros, expulsiones ni payouts, porque la tarea diaria solo avanza los círculos en curso.
   * Devuelve `false` si ya estaba pausado (pausar dos veces no es otro evento).
   */
  pause(today: LocalDate, by: { actorId: string; reason: string }): boolean {
    if (this.currentState === 'paused') return false;
    if (this.currentState !== 'contributing') {
      throw new InvalidCycleTransitionError('Solo se pausa un círculo en curso');
    }
    const before = this.snapshot();
    this.currentState = 'paused';
    this.pausedSince = today;
    this.adminLog.push({ action: 'pause', ...by, on: today, before, after: this.snapshot() });
    return true;
  }

  /**
   * Reanuda el ciclo (pending-scope §3.1, efectos recomendados de la pausa):
   * - Si la pausa duró al menos un turno, el calendario se corre esos turnos (inicio, fin y
   *   vencimientos), y las cuotas del turno en curso pasan al mes nuevo. El turno en curso **no**
   *   cambia: la junta sigue en el mismo turno, que ahora cae más tarde.
   * - Una cuota impaga que vencía durante la pausa pasa a vencer el día en que se reanuda; una que
   *   ya estaba en gracia al pausar se corre los días que duró la pausa, que no cuentan para la
   *   gracia.
   *
   * Los pasos los cuenta la cadencia (`stepsBetween`): en una junta mensual son meses de
   * calendario, igual que antes de COPAYNI-126; en una semanal, semanas corridas. Correr una
   * junta semanal por meses habría movido su cronograma un mes por cada pausa de un día que
   * cruzara el fin de mes.
   *
   * Devuelve `false` si ya estaba en curso.
   */
  resume(today: LocalDate, by: { actorId: string; reason: string }): boolean {
    if (this.currentState === 'contributing') return false;
    if (this.currentState !== 'paused' || !this.pausedSince) {
      throw new InvalidCycleTransitionError('Solo se reanuda un círculo pausado');
    }
    const before = this.snapshot();
    const pausedOn = this.pausedSince;
    const { cadence } = this.currentTerms;
    const steps = Math.max(0, cadence.stepsBetween(pausedOn, today));
    const pausedDays = Math.max(0, pausedOn.daysUntil(today));
    const turn = this.turn!;
    const periodBefore = this.currentPeriod!;
    if (steps > 0) {
      this.currentTerms = CircleTerms.create({
        payout: this.currentTerms.payout,
        turns: this.currentTerms.turns,
        cadence,
        startsOn: cadence.advance(this.currentTerms.startsOn, steps),
      });
      this.shift += periodBefore.monthsUntil(this.currentPeriod!);
    }
    const period = this.currentPeriod!;
    const shifted = this.schedule().dueOn(turn);
    this.touched.forEach((installment, index) => {
      if (installment.turn !== turn) return;
      const unpaid = installment.status === 'pending' || installment.status === 'overdue';
      let dueOn = steps > 0 ? shifted : installment.dueOn;
      if (unpaid && steps === 0 && installment.dueOn.isBefore(pausedOn)) {
        dueOn = installment.dueOn.addDays(pausedDays);
      }
      if (unpaid && dueOn.isBefore(today)) dueOn = today;
      this.touched[index] = { ...installment, period, dueOn };
    });
    this.currentState = 'contributing';
    this.pausedSince = null;
    this.adminLog.push({ action: 'resume', ...by, on: today, before, after: this.snapshot() });
    return true;
  }

  private snapshot(): CycleSnapshot {
    return {
      state: this.currentState,
      startsOn: this.currentTerms.startsOnPeriod.toString(),
      endsOn: this.currentTerms.endsOn.toString(),
      currentPeriod: this.currentPeriod?.toString() ?? null,
    };
  }

  /** Movimientos contables decididos desde `restore` (COPAYNI-58). */
  get ledger(): readonly LedgerTransaction[] {
    return [...this.entries];
  }

  /** Cierres de mes desde `restore`. */
  get periodCloses(): readonly PeriodClose[] {
    return [...this.closes];
  }

  /** Devoluciones a pagar porque el círculo terminó. */
  get refunds(): readonly Refund[] {
    return [...this.refundsToPay];
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

  /** Turno en curso (1..N), o `null` si el círculo no está en curso. */
  get currentTurn(): number | null {
    return this.turn;
  }

  /**
   * Mes en que cae el turno en curso, para informes y para lo que se guarda. Es una proyección:
   * fuera de la cadencia mensual varios turnos comparten mes, así que no identifica el turno.
   */
  get currentPeriod(): Period | null {
    return this.turn === null ? null : this.schedule().dueOn(this.turn).period;
  }

  /**
   * El cronograma de cobro: quién vence cuándo. Vive en un solo sitio para que el motor, los
   * vencimientos y el cierre no puedan discrepar.
   */
  private schedule(): TurnSchedule {
    return TurnSchedule.forCollection({
      startsOn: this.currentTerms.startsOn,
      cadence: this.currentTerms.cadence,
      turns: this.currentTerms.turns,
      dueDay: this.dueDay,
    });
  }

  /** Las cuotas del turno en curso y las que se abrieron o cambiaron desde `restore`. */
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

  /**
   * Llegó la fecha de inicio y el círculo todavía no empezó.
   *
   * Se compara contra la fecha real de arranque (COPAYNI-106), no contra su mes: una junta que
   * arranca un jueves 12 no empieza el día 1 de ese mes. Para los círculos que arrancan el día 1,
   * que son todos los mensuales, es la misma respuesta que antes.
   */
  isStartDue(today: LocalDate): boolean {
    return this.currentState === 'collecting' && !this.terms.startsOn.isAfter(today);
  }

  /** Turnos sin miembro. Antes de empezar, los que nunca se llenaron. */
  missingMembers(): number {
    return this.terms.turns - this.active.length;
  }

  /** Collecting → Contributing: abre las cuotas del primer turno. Requiere el círculo completo. */
  start(newId: () => string): void {
    if (this.currentState !== 'collecting') {
      throw new InvalidCycleTransitionError('Solo empieza un círculo que está reuniendo miembros');
    }
    if (this.missingMembers() > 0) {
      throw new InvalidCycleTransitionError(
        'Un círculo incompleto necesita la aprobación de sus miembros para empezar',
      );
    }
    this.currentState = 'contributing';
    this.openTurn(1, newId);
  }

  /** Collecting → Approving, o una ronda nueva sin los que salieron (COPAYNI-62). */
  proposeStart(terms: CircleTerms, respondBy: LocalDate, leaving: readonly string[] = []): void {
    if (this.currentState !== 'collecting' && this.currentState !== 'approving') {
      throw new InvalidCycleTransitionError('Solo se propone un círculo que todavía no empezó');
    }
    this.removeBeforeStart(leaving);
    this.currentState = 'approving';
    this.openedProposal = { terms, respondBy };
  }

  /**
   * Approving → Contributing con las condiciones aprobadas: los miembros con sus turnos nuevos y
   * los precios nuevos, congelados al empezar.
   */
  startReduced(terms: CircleTerms, members: readonly CycleMember[], newId: () => string): void {
    if (this.currentState !== 'approving') {
      throw new InvalidCycleTransitionError('Solo empieza reducido un círculo en aprobación');
    }
    this.currentTerms = terms;
    this.active.splice(0, this.active.length, ...members);
    this.reduced = true;
    this.currentState = 'collecting';
    this.start(newId);
  }

  /** Collecting o Approving → Cancelled: nunca abrió cuotas, así que nadie pagó. */
  cancel(): void {
    if (this.currentState !== 'collecting' && this.currentState !== 'approving') {
      throw new InvalidCycleTransitionError('Solo se cancela un círculo que no empezó');
    }
    this.removeBeforeStart(this.active.map(({ userId }) => userId));
    this.currentState = 'cancelled';
  }

  private removeBeforeStart(userIds: readonly string[]): void {
    for (const userId of userIds) {
      const index = this.active.findIndex((member) => member.userId === userId);
      if (index >= 0) this.active.splice(index, 1);
      this.leaving.push(userId);
    }
  }

  /**
   * Abre la cuota del turno en curso de quien tomó una vacante después de que se abrió el turno
   * (COPAYNI-59). Si la tomó desde el turno siguiente, su cuota de este turno es cero y no se abre.
   */
  admitReplacements(newId: () => string): CycleMember[] {
    if (this.currentState !== 'contributing') return [];
    const turn = this.turn!;
    const admitted = this.active.filter(
      ({ userId, quote }) =>
        quote.installments[turn - 1]!.isPositive() &&
        !this.touched.some(
          (installment) => installment.userId === userId && installment.turn === turn,
        ),
    );
    for (const member of admitted) this.openInstallment(member, turn, newId);
    return admitted;
  }

  /** Cuotas del turno en curso que vencieron hasta `today` y todavía se cobran. */
  dueInstallments(today: LocalDate): Installment[] {
    if (this.currentState !== 'contributing') return [];
    return this.touched.filter(
      (installment) =>
        installment.turn === this.turn &&
        (installment.status === 'pending' || installment.status === 'overdue') &&
        !installment.dueOn.isAfter(today),
    );
  }

  recordCollection(installmentId: string, outcome: CollectionOutcome): Installment {
    const index = this.touched.findIndex(({ id }) => id === installmentId);
    const installment = this.touched[index];
    if (!installment || (installment.status !== 'pending' && installment.status !== 'overdue')) {
      throw new InvalidCycleTransitionError('La cuota no existe o ya no se cobra');
    }
    const updated = { ...installment, status: outcome === 'paid' ? 'paid' : 'overdue' } as const;
    this.touched[index] = updated;
    return updated;
  }

  /**
   * Cuotas del turno en curso cuyo cobro falló y cuya gracia terminó antes de `today`: con
   * vencimiento el día 1 y 3 días de gracia, el último día para pagar es el 4 y se expulsa el 5.
   * Una cuota que nunca se intentó cobrar (`pending`, p. ej. si la tarea no corrió) no cuenta.
   */
  defaultedInstallments(today: LocalDate): Installment[] {
    if (this.currentState !== 'contributing') return [];
    return this.touched.filter(
      (installment) =>
        installment.turn === this.turn &&
        installment.status === 'overdue' &&
        today.isAfter(installment.dueOn.addDays(this.delinquency.graceDays)),
    );
  }

  /**
   * Expulsa al miembro de una cuota impaga después de la gracia (pending-scope §3.1): la cuota
   * pasa a `defaulted` y el miembro sale del ciclo, así que no se le abren más cuotas y su turno,
   * si no cobró, queda libre.
   * - Debe lo vencido más el cargo por mora; si ya cobró, también sus cuotas restantes, menos su
   *   retención, que va al fondo (COPAYNI-60).
   * - Si no cobró, se le devuelve lo pagado menos la penalidad al cerrar el círculo.
   */
  expel(installmentId: string, today: LocalDate): Expulsion {
    const installment = this.defaultedInstallments(today).find(({ id }) => id === installmentId);
    const member = this.active.find(({ userId }) => userId === installment?.userId);
    if (!installment || !member) {
      throw new InvalidCycleTransitionError('La cuota no está impaga después de la gracia');
    }
    // Índice de su cuota en el precio del slot, que va por turnos desde cero.
    const index = installment.turn - 1;
    const sum = (amounts: readonly Money[]): Money =>
      amounts.reduce((total, amount) => total.add(amount), Money.zero(this.terms.currency));
    // Los turnos anteriores cerraron con todas sus cuotas pagadas: cobró si su turno ya pasó.
    const alreadyPaidOut = member.position <= index;
    const paid = sum(member.quote.installments.slice(0, index));
    const remaining = sum(member.quote.installments.slice(index));
    const retentionApplied = alreadyPaidOut
      ? Money.of(Math.min(member.quote.retention.amount, remaining.amount), this.terms.currency)
      : Money.zero(this.terms.currency);
    const expulsion: Expulsion = {
      userId: member.userId,
      position: member.position,
      period: installment.period,
      expelledOn: today,
      overdue: alreadyPaidOut ? remaining.subtract(retentionApplied) : installment.amount,
      lateFee: installment.amount.percentage(this.delinquency.lateFeeBps),
      paid: alreadyPaidOut ? null : paid,
      refund: alreadyPaidOut
        ? null
        : paid.subtract(paid.percentage(this.delinquency.refundPenaltyBps)),
      retentionApplied,
    };
    const toFund = LedgerTransaction.transfer({
      key: `retention_to_fund:${this.circleId}:${member.userId}`,
      kind: 'retention_to_fund',
      from: { account: 'retention_held', userId: member.userId },
      to: { account: 'guarantee_fund' },
      amount: retentionApplied,
      circleId: this.circleId,
      period: installment.period,
    });
    if (toFund) {
      this.entries.push(toFund);
      this.fundBalance = this.fundBalance.add(retentionApplied);
    }

    this.touched[this.touched.indexOf(installment)] = { ...installment, status: 'defaulted' };
    this.active.splice(this.active.indexOf(member), 1);
    this.expelled.push(expulsion);
    return expulsion;
  }

  /**
   * El turno en curso ya venció y todas sus cuotas están pagadas o incobrables (`defaulted`). Sin
   * la fecha, un círculo sin miembros cerraría todos sus turnos de una vez.
   */
  isPeriodSettled(today: LocalDate): boolean {
    return (
      this.currentState === 'contributing' &&
      !this.schedule().dueOn(this.turn!).isAfter(today) &&
      this.touched
        .filter(({ turn }) => turn === this.turn)
        .every(({ status }) => ['paid', 'defaulted', 'retained', 'deducted'].includes(status))
    );
  }

  /** Quien tiene el turno en curso, o `undefined` si ese turno está libre. */
  receiver(): CycleMember | undefined {
    if (this.turn === null) return undefined;
    return this.active.find((member) => member.position === this.turn);
  }

  /**
   * Checking → Setting Receiver → Distributing → Distributed: decide el payout del mes y pasa al
   * mes siguiente, o termina después del último. Devuelve `null` si el turno del mes está libre.
   *
   * Con el fondo de garantía (COPAYNI-58, `settlePeriod`): el fondo cubre lo que falta para el
   * payout completo; si no alcanza, el payout se reduce. Al terminar, se deciden las
   * devoluciones de los expulsados antes de su turno.
   */
  closePeriod(today: LocalDate, newId: () => string): Disbursement | null {
    if (!this.isPeriodSettled(today)) {
      throw new InvalidCycleTransitionError('El turno tiene cuotas sin pagar ni expulsión');
    }
    const turn = this.turn!;
    const period = this.currentPeriod!;
    const index = turn - 1;
    const receiver = this.receiver();
    const paid = this.touched.filter(
      (installment) => installment.turn === turn && installment.status === 'paid',
    );
    // Quien pagó este turno sigue en el ciclo: se expulsa solo por una cuota impaga.
    const catchUp = paid.reduce((sum, { userId }) => {
      const share = this.active.find((member) => member.userId === userId)?.quote.catchUp?.[index];
      return share ? sum.add(share) : sum;
    }, Money.zero(this.terms.currency));
    const retained = this.touched
      .filter((installment) => installment.turn === turn && installment.status === 'retained')
      .map(({ userId, amount }) => ({ userId, amount }));
    const settlement = settlePeriod({
      circleId: this.circleId,
      terms: this.terms,
      period,
      turn,
      paid: paid.map(({ amount }) => amount),
      catchUp,
      retained,
      receiver: receiver && {
        userId: receiver.userId,
        netPayout: receiver.quote.netPayout,
        adminFee: receiver.quote.adminFee,
        retention: receiver.quote.retention,
      },
      deducted: this.touched.find(
        (installment) =>
          installment.turn === turn &&
          installment.status === 'deducted' &&
          installment.userId === receiver?.userId,
      )?.amount,
      fundBalance: this.fundBalance,
      feeShareBps: this.feeShareBps,
    });
    this.entries.push(...settlement.transactions);
    this.fundBalance = settlement.fundBalance;
    const { coverage, shortfall, returned } = settlement;
    this.closes.push({ period, coverage, shortfall, returned });
    const disbursement =
      receiver && settlement.payout
        ? {
            turn,
            period,
            userId: receiver.userId,
            position: receiver.position,
            amount: settlement.payout,
          }
        : null;
    if (disbursement) this.payouts.push(disbursement);

    // El círculo termina al cerrar el último turno. Antes se comparaba el mes con el mes de fin,
    // y en una junta semanal todos los turnos caen en ese mes: terminaba en el primer cierre,
    // habiendo pagado a un solo miembro (COPAYNI-126).
    if (turn >= this.terms.turns) {
      this.currentState = 'finished';
      this.turn = null;
      this.decideRefunds();
    } else {
      this.openTurn(turn + 1, newId);
    }
    return disbursement;
  }

  /** Al cerrar el círculo se devuelve lo pagado menos la penalidad (pending-scope §3.1). */
  private decideRefunds(): void {
    const owed: PendingRefund[] = [...this.pendingRefunds];
    for (const { userId, paid, refund } of this.expelled) {
      if (paid && refund) owed.push({ userId, paid, refund });
    }
    for (const { userId, paid, refund } of owed) {
      const transactions = refundTransactions({ circleId: this.circleId, userId, paid, refund });
      this.entries.push(...transactions);
      for (const transaction of transactions) {
        this.fundBalance = this.fundBalance.add(transaction.netFor('guarantee_fund'));
      }
      if (refund.isPositive()) this.refundsToPay.push({ userId, amount: refund });
    }
  }

  private openTurn(turn: number, newId: () => string): void {
    this.turn = turn;
    for (const member of this.active) {
      // Quien tomó una vacante no paga los turnos anteriores a su ingreso (COPAYNI-59).
      if (member.quote.installments[turn - 1]!.isPositive()) {
        this.openInstallment(member, turn, newId);
      }
    }
  }

  private openInstallment(member: CycleMember, turn: number, newId: () => string): void {
    const index = turn - 1;
    // Sus últimas cuotas las paga la retención de su payout (COPAYNI-60).
    const retainedFrom =
      this.terms.turns - retainedInstallments(member.quote, this.terms.baseInstallment);
    // El vencimiento lo da el cronograma, no un día fijo del mes: fuera de la cadencia mensual
    // ese día no corresponde a ningún turno (COPAYNI-126).
    const dueOn = this.schedule().dueOn(turn);
    this.touched.push({
      id: newId(),
      userId: member.userId,
      position: member.position,
      turn,
      period: dueOn.period,
      dueOn,
      amount: member.quote.installments[index]!,
      status:
        index >= retainedFrom
          ? 'retained'
          : member.deductPayInFromPayout && turn === member.position
            ? 'deducted'
            : 'pending',
    });
  }
}
