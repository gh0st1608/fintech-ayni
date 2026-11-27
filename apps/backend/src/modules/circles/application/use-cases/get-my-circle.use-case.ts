import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { type LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { Period } from '../../../../shared/domain/value-objects/period';
import { NotFoundError } from '../../../../shared/errors/app-error';
import { type CycleState } from '../../domain/entities/circle-cycle';
import { type SlotPricing, type SlotQuote } from '../../domain/services/slot-pricing';
import { TurnSchedule } from '../../domain/services/turn-schedule';
import { type CircleTerms } from '../../domain/value-objects/circle-terms';
import { CIRCLE_REPOSITORY, type CircleRepositoryPort } from '../ports/circle-repository.port';
import {
  type CalendarMember,
  MY_CIRCLE_CALENDAR,
  type MyCircleCalendarPort,
} from '../ports/my-circle-calendar.port';
import {
  type DueInstallment,
  PAYMENTS_QUERY,
  type PaymentsQueryPort,
} from '../ports/payments-query.port';
import { SLOT_PRICING } from './get-available-slots.use-case';

/** `paid`: ya cobró; `current`: cobra este mes; `upcoming`: más adelante; `vacant`: sin miembro. */
export type TurnStatus = 'paid' | 'current' | 'upcoming' | 'vacant';

export interface CircleTurn {
  position: number;
  /**
   * Ordinal del turno (1..N). Coincide con `position`, y existe con su propio nombre porque es
   * lo que identifica el turno: el mes no lo hace fuera de la cadencia mensual (COPAYNI-117).
   */
  turn: number;
  period: Period;
  /** Día real en que ese turno cobra el pozo, calculado por `TurnSchedule`. */
  payoutOn: LocalDate;
  /** Nombre abreviado ("María R."): el resto de los datos de los demás miembros no se muestra. */
  memberName: string | null;
  isMe: boolean;
  status: TurnStatus;
}

export interface MyCircleDetail {
  circleId: string;
  state: CycleState;
  terms: CircleTerms;
  quote: SlotQuote;
  currentPeriod: Period | null;
  /** Mes del ciclo en curso, de 1 a `months`; `null` si todavía no empezó. */
  currentMonth: number | null;
  /** Turno en curso, de 1 a `turns`; `null` si todavía no empezó (COPAYNI-117). */
  currentTurn: number | null;
  /** Día real del último turno, que es cuando termina la junta. */
  endsOnDate: LocalDate;
  /** La próxima cuota que debe en este círculo, si tiene. */
  nextDue: DueInstallment | null;
  turns: CircleTurn[];
}

/** "María R.": nombre y la inicial del apellido. Sin nombre registrado, `null`. */
export function abbreviatedName(member: CalendarMember): string | null {
  const first = member.firstName?.trim().split(/\s+/)[0];
  if (!first) return null;
  const initial = member.lastName?.trim().charAt(0);
  return initial ? `${first} ${initial.toUpperCase()}.` : first;
}

/**
 * Detalle de un círculo para uno de sus miembros (COPAYNI-88, diseño D8): pozo, progreso, su
 * turno y su cuota, la próxima cuota que debe y los turnos con los demás miembros abreviados.
 * Solo lo ve un miembro vigente: para los demás (o un expulsado) no existe.
 */
@Injectable()
export class GetMyCircleUseCase {
  constructor(
    @Inject(CIRCLE_REPOSITORY) private readonly circles: CircleRepositoryPort,
    @Inject(MY_CIRCLE_CALENDAR) private readonly calendars: MyCircleCalendarPort,
    @Inject(PAYMENTS_QUERY) private readonly payments: PaymentsQueryPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
  ) {}

  async execute(principal: Principal, circleId: string): Promise<MyCircleDetail> {
    const notFound = new NotFoundError('No se encontró el círculo', 'CIRCLE_NOT_FOUND');
    const circle = await this.circles.findById(circleId);
    const membership = circle?.memberships.find(({ userId }) => userId === principal.userId);
    if (!circle || !membership) throw notFound;
    const [calendar, dues] = await Promise.all([
      this.calendars.find(circle.id),
      this.payments.dueInstallmentsOf(principal.userId),
    ]);
    if (!calendar) throw notFound;

    const { terms } = circle;
    const current = calendar.currentPeriod;
    const currentPeriod = current === null ? null : Period.parse(current);
    const currentMonth =
      currentPeriod === null ? null : terms.startsOnPeriod.monthsUntil(currentPeriod) + 1;
    // El turno en curso sale de la columna; solo se deriva del mes cuando falta, igual que el
    // backfill de la expansión (COPAYNI-107), y eso solo acierta en cadencia mensual.
    const currentTurn = calendar.currentTurn ?? (terms.cadence.isMonthly() ? currentMonth : null);
    // El cronograma es el único que hace aritmética de calendario de la junta (COPAYNI-105).
    const schedule = new TurnSchedule(terms.startsOn, terms.cadence, terms.turns);
    const paid = new Set(calendar.paidTurns);
    const turns = Array.from({ length: terms.turns }, (_unused, index): CircleTurn => {
      const position = index + 1;
      const payoutOn = schedule.payoutOn(position);
      const member = calendar.members.find((candidate) => candidate.position === position);
      const status: TurnStatus = paid.has(position)
        ? 'paid'
        : !member
          ? 'vacant'
          : currentTurn === position
            ? 'current'
            : 'upcoming';
      return {
        position,
        turn: position,
        period: payoutOn.period,
        payoutOn,
        memberName: member ? abbreviatedName(member) : null,
        isMe: member?.userId === principal.userId,
        status,
      };
    });

    return {
      circleId: circle.id,
      state: calendar.state,
      terms,
      quote: this.pricing.quoteOf(terms, membership.position, membership.price),
      currentPeriod,
      currentMonth,
      currentTurn,
      endsOnDate: schedule.endsOn(),
      nextDue: dues.find((due) => due.circleId === circle.id) ?? null,
      turns,
    };
  }
}
