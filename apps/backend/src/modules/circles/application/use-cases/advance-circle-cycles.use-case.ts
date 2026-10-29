import { randomUUID } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { CircleCycle, type DelinquencyPolicy } from '../../domain/entities/circle-cycle';
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
import { SLOT_PRICING } from './get-available-slots.use-case';

export const CIRCLE_CYCLE = Symbol('CIRCLE_CYCLE');

export interface CircleCycleSettings {
  /** Día del mes en que vence cada cuota (pending-scope R19, provisional). */
  dueDay: number;
  timeZone: string;
  /** Gracia, cargo por mora y penalidad de devolución (COPAYNI-57). */
  delinquency: DelinquencyPolicy;
}

export interface AdvanceCyclesResult {
  advanced: number;
  /** Otra ejecución los tenía bloqueados. */
  locked: number;
  failed: number;
}

/**
 * Tarea diaria del ciclo mensual (COPAYNI-56). Para cada círculo pendiente, con el círculo
 * bloqueado:
 * - Lo empieza cuando llega su mes de inicio, abriendo las cuotas del primer mes.
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
      members: stored.members.map(({ userId, position, price }) => ({
        userId,
        position,
        quote: this.pricing.quoteOf(terms, position, price),
      })),
    });
    if (cycle.isStartDue(today)) {
      cycle.start(randomUUID);
      this.logger.log({ event: 'circles.cycle.started', circleId, members: cycle.members.length });
    }

    while (cycle.state === 'contributing') {
      for (const { id } of cycle.defaultedInstallments(today)) {
        const expulsion = cycle.expel(id, today);
        // Su cuota la cubre el fondo (COPAYNI-58); la vacante se ofrece con COPAYNI-59.
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
        // Turno libre (pending-scope R2 y R17): el destino del pozo llega con COPAYNI-58 y 59.
        this.logger.warn({ event: 'circles.cycle.payout_unassigned', circleId, period });
      }
      if (cycle.isFinished()) {
        this.logger.log({ event: 'circles.cycle.finished', circleId });
      }
    }
    return cycle;
  }
}
