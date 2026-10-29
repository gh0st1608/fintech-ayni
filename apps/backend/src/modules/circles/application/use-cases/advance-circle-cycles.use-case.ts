import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { CircleCycle, type PeriodClose } from '../../domain/entities/circle-cycle';
import { type SlotPricing } from '../../domain/services/slot-pricing';
import {
  CIRCLE_CYCLE_REPOSITORY,
  type CircleCycleRepositoryPort,
  type StoredCycle,
} from '../ports/circle-cycle-repository.port';
import {
  CONTRIBUTIONS,
  type ContributionsPort,
  DISBURSEMENTS,
  type DisbursementsPort,
} from '../ports/cycle-payments.port';
import { CIRCLE_CYCLE, type CircleCycleSettings } from './cycle-settings';
import { SLOT_PRICING } from './get-available-slots.use-case';

export { CIRCLE_CYCLE, type CircleCycleSettings } from './cycle-settings';

export interface AdvanceCyclesResult {
  advanced: number;
  /** Otra ejecución los tenía bloqueados. */
  locked: number;
  failed: number;
}

/**
 * Tarea diaria del ciclo mensual (COPAYNI-56). Para cada círculo pendiente, con el círculo
 * bloqueado:
 * - Lo empieza cuando llega su mes de inicio, abriendo las cuotas del primer mes. Si faltan
 *   miembros no empieza: se registra que necesita la aprobación de sus miembros (R2).
 * - Abre la cuota del mes de quien tomó una vacante después de abrirse el mes (COPAYNI-59).
 * - Expulsa a quien no pagó al terminar la gracia (COPAYNI-57), antes de reintentar el cobro: un
 *   pago que llega después de la gracia no evita la expulsión.
 * - Cobra las cuotas vencidas: las que no se pueden cobrar quedan `overdue` y se reintentan
 *   al día siguiente, durante la gracia.
 * - Con todas las cuotas del mes pagadas o incobrables, paga el payout a quien tiene el turno y
 *   abre el mes siguiente, o termina el círculo. Si la tarea no corrió varios días, se pone al día.
 *
 * Es idempotente: el estado se guarda con cada círculo y los puertos de pago son idempotentes,
 * así que volver a ejecutarla el mismo día no duplica cobros ni payouts. Un círculo que falla
 * no detiene a los demás.
 */
@Injectable()
export class AdvanceCircleCyclesUseCase {
  private readonly logger = new Logger('CircleCycle');

  constructor(
    @Inject(CIRCLE_CYCLE_REPOSITORY) private readonly cycles: CircleCycleRepositoryPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
    @Inject(CIRCLE_CYCLE) private readonly settings: CircleCycleSettings,
    @Inject(CONTRIBUTIONS) private readonly contributions: ContributionsPort,
    @Inject(DISBURSEMENTS) private readonly disbursements: DisbursementsPort,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(): Promise<AdvanceCyclesResult> {
    const today = LocalDate.fromDate(this.clock.now(), this.settings.timeZone);
    const result: AdvanceCyclesResult = { advanced: 0, locked: 0, failed: 0 };
    for (const circleId of await this.cycles.listToAdvance(today.period)) {
      try {
        const advanced = await this.cycles.withLock(circleId, (stored) =>
          this.advance(stored, today),
        );
        result[advanced ? 'advanced' : 'locked'] += 1;
      } catch (error) {
        result.failed += 1;
        this.logger.error({
          event: 'circles.cycle.failed',
          circleId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return result;
  }

  private async advance(stored: StoredCycle, today: LocalDate): Promise<CircleCycle> {
    const { circleId, terms } = stored;
    const cycle = CircleCycle.restore({
      ...stored,
      dueDay: this.settings.dueDay,
      delinquency: this.settings.delinquency,
      fund: { balance: stored.fundBalance, feeShareBps: this.settings.fundFeeShareBps },
      members: stored.members.map(({ userId, position, price, deductPayIn }) => ({
        userId,
        position,
        quote: this.pricing.quoteOf(terms, position, price),
        deductPayInFromPayout: deductPayIn ?? false,
      })),
    });
    if (cycle.isStartDue(today)) {
      const missing = cycle.missingMembers();
      if (missing > 0) {
        // Pending-scope R2: el fondo no cubre turnos sin llenar; se reduce con aprobación.
        this.logger.warn({
          event: 'circles.cycle.start_approval_required',
          circleId,
          members: cycle.members.length,
          missing,
        });
        return cycle;
      }
      cycle.start(randomUUID);
      this.logger.log({ event: 'circles.cycle.started', circleId, members: cycle.members.length });
    }

    for (const { userId, position } of cycle.admitReplacements(randomUUID)) {
      this.logger.log({ event: 'circles.cycle.replacement_admitted', circleId, userId, position });
    }

    while (cycle.state === 'contributing') {
      for (const { id } of cycle.defaultedInstallments(today)) {
        const expulsion = cycle.expel(id, today);
        // Su cuota la cubre el fondo (COPAYNI-58) y, si no cobró, su turno se ofrece (COPAYNI-59).
        this.logger.warn({
          event: 'circles.cycle.member_expelled',
          circleId,
          userId: expulsion.userId,
          period: expulsion.period.toString(),
          overdue: expulsion.overdue.amount,
          lateFee: expulsion.lateFee.amount,
          refund: expulsion.refund?.amount ?? null,
          currency: expulsion.overdue.currency,
        });
      }
      for (const installment of cycle.dueInstallments(today)) {
        const outcome = await this.contributions.collect({ ...installment, circleId });
        cycle.recordCollection(installment.id, outcome);
        this.logger.log({
          event:
            outcome === 'paid'
              ? 'circles.cycle.installment_paid'
              : 'circles.cycle.installment_overdue',
          circleId,
          userId: installment.userId,
          period: installment.period.toString(),
        });
      }
      if (!cycle.isPeriodSettled(today)) break;

      const period = cycle.currentPeriod!.toString();
      const disbursement = cycle.closePeriod(today, randomUUID);
      if (disbursement) {
        await this.disbursements.disburse({ ...disbursement, circleId });
        this.logger.log({
          event: 'circles.cycle.payout_disbursed',
          circleId,
          userId: disbursement.userId,
          period,
        });
      } else {
        // Turno del expulsado sin reemplazo (R17): el pozo vuelve al fondo (COPAYNI-58).
        this.logger.warn({ event: 'circles.cycle.payout_unassigned', circleId, period });
      }
      this.logClose(circleId, cycle.periodCloses.at(-1)!);
      if (cycle.isFinished()) {
        for (const refund of cycle.refunds) {
          await this.disbursements.refund({ ...refund, circleId });
          this.logger.log({
            event: 'circles.cycle.refund_paid',
            circleId,
            userId: refund.userId,
            amount: refund.amount.amount,
          });
        }
        this.logger.log({ event: 'circles.cycle.finished', circleId });
      }
    }
    return cycle;
  }

  /** Auditoría de lo que hizo el fondo al cerrar el mes. */
  private logClose(circleId: string, close: PeriodClose): void {
    const period = close.period.toString();
    if (close.coverage.isPositive()) {
      this.logger.log({
        event: 'circles.fund.covered',
        circleId,
        period,
        amount: close.coverage.amount,
      });
    }
    if (close.shortfall.isPositive()) {
      // Pending-scope §3.1, regla 7: se avisa a quien cobra y el fondo le debe la diferencia.
      this.logger.warn({
        event: 'circles.cycle.payout_reduced',
        circleId,
        period,
        shortfall: close.shortfall.amount,
      });
    }
    if (close.returned.isPositive()) {
      this.logger.log({
        event: 'circles.fund.pot_returned',
        circleId,
        period,
        amount: close.returned.amount,
      });
    }
  }
}
