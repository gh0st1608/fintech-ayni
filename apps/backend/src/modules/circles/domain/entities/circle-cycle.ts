import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { Money } from '../../../../shared/domain/value-objects/money';
import { type Period } from '../../../../shared/domain/value-objects/period';
import { DomainError } from '../../../../shared/errors/app-error';
import { refundTransactions, settlePeriod } from '../services/period-settlement';
import { retainedInstallments, type SlotQuote } from '../services/slot-pricing';
import { CircleTerms } from '../value-objects/circle-terms';
import { LedgerTransaction } from '../value-objects/ledger-transaction';

/**
 * Estados que se guardan. Los pasos Checking, Setting Receiver, Distributing y Distributed del
 * workflow ROSCA (pending-scope §3.1) ocurren juntos al cerrar un mes (`closePeriod`).
 */
export const CYCLE_STATES = ['collecting', 'contributing', 'finished', 'paused'] as const;
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
 * Ciclo mensual de un Game'ya (COPAYNI-56, workflow ROSCA del PO):
 * `collecting` → cada mes `contributing` (cobro de cuotas) → cierre del mes (quién cobra y
 * payout) → `finished` después del último mes. `paused` detiene el ciclo (COPAYNI-61).
 *
 * Un mes se cierra cuando todas sus cuotas están pagadas o incobrables. Una cuota cuyo cobro
 * falló queda `overdue`; si sigue impaga al terminar la gracia, el miembro es expulsado
 * (COPAYNI-57): su cuota pasa a `defaulted`, sale del ciclo y su turno queda libre. El fondo de
 * garantía cubre esa vacante (COPAYNI-58) hasta que la toma un miembro nuevo (COPAYNI-59), que
 * paga la puesta al día con sus cuotas.
 *
 * Un círculo solo empieza con todos sus turnos ocupados: el fondo no cubre turnos que nunca se
 * llenaron. Si llega el mes de inicio y faltan miembros, el PO decidió reducir el pozo y los
 * integrantes con la aprobación de los miembros (pending-scope R2); mientras ese flujo no exista,
 * el círculo espera en `collecting`.
 */
export class CircleCycle {
  private shift = 0;
  private readonly adminLog: CycleAdminEvent[] = [];

  private constructor(
    readonly circleId: string,
    private currentTerms: CircleTerms,
    /** Día del mes en que vence cada cuota (pending-scope R19). */
    private readonly dueDay: number,
    private readonly delinquency: DelinquencyPolicy,
    private currentState: CycleState,
    private period: Period | null,
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

  /** Pausas y reanudaciones desde `restore`. */
  get adminEvents(): readonly CycleAdminEvent[] {
    return [...this.adminLog];
  }

  /**
   * `members`: los no expulsados. `installments`: las del mes en curso. `pendingRefunds`: las
   * devoluciones de los expulsados de este círculo que todavía no se pagaron.
   */
  static restore(props: {
    circleId: string;
    terms: CircleTerms;
    dueDay: number;
    delinquency: DelinquencyPolicy;
    fund: CycleFund;
    state: CycleState;
    currentPeriod: Period | null;
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
    const notRunning = state === 'collecting' || state === 'finished';
    const running = state === 'contributing' || state === 'paused';
    if ((running && currentPeriod === null) || (notRunning && currentPeriod)) {
      throw new InvalidCycleTransitionError('Solo un círculo en curso tiene un mes en curso');
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
      currentPeriod,
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
   * - Si la pausa pasó a otro mes, el calendario se corre los meses que duró (inicio, fin y mes en
   *   curso), y las cuotas del mes en curso pasan al mes nuevo.
   * - Una cuota impaga que vencía durante la pausa pasa a vencer el día en que se reanuda; una que
   *   ya estaba en gracia al pausar se corre los días que duró la pausa, que no cuentan para la
   *   gracia.
   * Devuelve `false` si ya estaba en curso.
   */
  resume(today: LocalDate, by: { actorId: string; reason: string }): boolean {
    if (this.currentState === 'contributing') return false;
    if (this.currentState !== 'paused' || !this.pausedSince) {
      throw new InvalidCycleTransitionError('Solo se reanuda un círculo pausado');
    }
    const before = this.snapshot();
    const pausedOn = this.pausedSince;
    const months = Math.max(0, pausedOn.period.monthsUntil(today.period));
    const pausedDays = Math.max(0, pausedOn.daysUntil(today));
    const period = this.period!.addMonths(months);
    this.touched.forEach((installment, index) => {
      if (!installment.period.equals(this.period!)) return;
      const unpaid = installment.status === 'pending' || installment.status === 'overdue';
      let dueOn = months > 0 ? LocalDate.of(period, this.dueDay) : installment.dueOn;
      if (unpaid && months === 0 && installment.dueOn.isBefore(pausedOn)) {
        dueOn = installment.dueOn.addDays(pausedDays);
      }
      if (unpaid && dueOn.isBefore(today)) dueOn = today;
      this.touched[index] = { ...installment, period, dueOn };
    });
    if (months > 0) {
      const { payout } = this.currentTerms;
      this.currentTerms = CircleTerms.create({
        payout,
        months: this.currentTerms.months,
        startsOn: this.currentTerms.startsOn.addMonths(months),
      });
      this.period = period;
      this.shift += months;
    }
    this.currentState = 'contributing';
    this.pausedSince = null;
    this.adminLog.push({ action: 'resume', ...by, on: today, before, after: this.snapshot() });
    return true;
  }

  private snapshot(): CycleSnapshot {
    return {
      state: this.currentState,
      startsOn: this.currentTerms.startsOn.toString(),
      endsOn: this.currentTerms.endsOn.toString(),
      currentPeriod: this.period?.toString() ?? null,
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

  /** Turnos sin miembro. Antes de empezar, los que nunca se llenaron. */
  missingMembers(): number {
    return this.terms.months - this.active.length;
  }

  /** Collecting → Contributing: abre las cuotas del primer mes. Requiere el círculo completo. */
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
    this.openPeriod(this.terms.startsOn, newId);
  }

  /**
   * Abre la cuota del mes en curso de quien tomó una vacante después de que se abrió el mes
   * (COPAYNI-59). Si la tomó desde el mes siguiente, su cuota de este mes es cero y no se abre.
   */
  admitReplacements(newId: () => string): CycleMember[] {
    if (this.currentState !== 'contributing') return [];
    const period = this.period!;
    const month = this.terms.startsOn.monthsUntil(period);
    const admitted = this.active.filter(
      ({ userId, quote }) =>
        quote.installments[month]!.isPositive() &&
        !this.touched.some(
          (installment) => installment.userId === userId && installment.period.equals(period),
        ),
    );
    for (const member of admitted) this.openInstallment(member, period, newId);
    return admitted;
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
    if (!installment || (installment.status !== 'pending' && installment.status !== 'overdue')) {
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
    const month = this.terms.startsOn.monthsUntil(installment.period);
    const sum = (amounts: readonly Money[]): Money =>
      amounts.reduce((total, amount) => total.add(amount), Money.zero(this.terms.currency));
    // Los meses anteriores cerraron con todas sus cuotas pagadas: cobró si su turno ya pasó.
    const alreadyPaidOut = member.position <= month;
    const paid = sum(member.quote.installments.slice(0, month));
    const remaining = sum(member.quote.installments.slice(month));
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
   * El mes en curso ya venció y todas sus cuotas están pagadas o incobrables (`defaulted`). Sin la
   * fecha, un círculo sin miembros cerraría todos sus meses de una vez.
   */
  isPeriodSettled(today: LocalDate): boolean {
    return (
      this.currentState === 'contributing' &&
      !LocalDate.of(this.period!, this.dueDay).isAfter(today) &&
      this.touched
        .filter(({ period }) => period.equals(this.period!))
        .every(({ status }) => ['paid', 'defaulted', 'retained', 'deducted'].includes(status))
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
   *
   * Con el fondo de garantía (COPAYNI-58, `settlePeriod`): el fondo cubre lo que falta para el
   * payout completo; si no alcanza, el payout se reduce. Al terminar, se deciden las
   * devoluciones de los expulsados antes de su turno.
   */
  closePeriod(today: LocalDate, newId: () => string): Disbursement | null {
    if (!this.isPeriodSettled(today)) {
      throw new InvalidCycleTransitionError('El mes tiene cuotas sin pagar ni expulsión');
    }
    const period = this.period!;
    const month = this.terms.startsOn.monthsUntil(period);
    const receiver = this.receiver();
    const paid = this.touched.filter(
      (installment) => installment.period.equals(period) && installment.status === 'paid',
    );
    // Quien pagó este mes sigue en el ciclo: se expulsa solo por una cuota impaga.
    const catchUp = paid.reduce((sum, { userId }) => {
      const share = this.active.find((member) => member.userId === userId)?.quote.catchUp?.[month];
      return share ? sum.add(share) : sum;
    }, Money.zero(this.terms.currency));
    const retained = this.touched
      .filter(
        (installment) => installment.period.equals(period) && installment.status === 'retained',
      )
      .map(({ userId, amount }) => ({ userId, amount }));
    const settlement = settlePeriod({
      circleId: this.circleId,
      terms: this.terms,
      period,
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
          installment.period.equals(period) &&
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
            period,
            userId: receiver.userId,
            position: receiver.position,
            amount: settlement.payout,
          }
        : null;
    if (disbursement) this.payouts.push(disbursement);

    if (period.equals(this.terms.endsOn)) {
      this.currentState = 'finished';
      this.period = null;
      this.decideRefunds();
    } else {
      this.openPeriod(period.addMonths(1), newId);
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

  private openPeriod(period: Period, newId: () => string): void {
    this.period = period;
    const month = this.terms.startsOn.monthsUntil(period);
    for (const member of this.active) {
      // Quien tomó una vacante no paga los meses anteriores a su ingreso (COPAYNI-59).
      if (member.quote.installments[month]!.isPositive()) {
        this.openInstallment(member, period, newId);
      }
    }
  }

  private openInstallment(member: CycleMember, period: Period, newId: () => string): void {
    const month = this.terms.startsOn.monthsUntil(period);
    // Sus últimas cuotas las paga la retención de su payout (COPAYNI-60).
    const retainedFrom =
      this.terms.months - retainedInstallments(member.quote, this.terms.baseInstallment);
    this.touched.push({
      id: newId(),
      userId: member.userId,
      position: member.position,
      period,
      dueOn: LocalDate.of(period, this.dueDay),
      amount: member.quote.installments[month]!,
      status:
        month >= retainedFrom
          ? 'retained'
          : member.deductPayInFromPayout && month === member.position - 1
            ? 'deducted'
            : 'pending',
    });
  }
}
