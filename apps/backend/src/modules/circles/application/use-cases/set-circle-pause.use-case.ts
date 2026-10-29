import { Inject, Injectable, Logger } from '@nestjs/common';

import { CLOCK, type ClockPort } from '../../../../shared/application/ports/clock.port';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { ValidationError } from '../../../../shared/errors/app-error';
import { CircleCycle, type CycleState } from '../../domain/entities/circle-cycle';
import { type SlotPricing } from '../../domain/services/slot-pricing';
import {
  CIRCLE_CYCLE_REPOSITORY,
  type CircleCycleRepositoryPort,
} from '../ports/circle-cycle-repository.port';
import { CIRCLE_CYCLE, type CircleCycleSettings } from './cycle-settings';
import { SLOT_PRICING } from './get-available-slots.use-case';

export interface SetCirclePauseCommand {
  circleId: string;
  /** `pause` o `resume`. */
  action: 'pause' | 'resume';
  /** Quien lo pide: un `super_admin` (lo verifica el guard). */
  actorId: string;
  reason: string;
}

export interface SetCirclePauseResult {
  state: CycleState;
  /** `false` si ya estaba así: no hay otro evento. */
  changed: boolean;
  startsOn: string;
  endsOn: string;
}

/**
 * Pausa o reanuda un círculo en curso (COPAYNI-61). Solo el admin general, con motivo
 * obligatorio. Espera el bloqueo del círculo, así que no se intercala con la tarea diaria, y
 * guarda la auditoría en la misma transacción. Es idempotente.
 */
@Injectable()
export class SetCirclePauseUseCase {
  private readonly logger = new Logger('CircleAdmin');

  constructor(
    @Inject(CIRCLE_CYCLE_REPOSITORY) private readonly cycles: CircleCycleRepositoryPort,
    @Inject(SLOT_PRICING) private readonly pricing: SlotPricing,
    @Inject(CIRCLE_CYCLE) private readonly settings: CircleCycleSettings,
    @Inject(CLOCK) private readonly clock: ClockPort,
  ) {}

  async execute(command: SetCirclePauseCommand): Promise<SetCirclePauseResult> {
    const reason = command.reason.trim();
    if (!reason) throw new ValidationError('El motivo es obligatorio', { reason: 'required' });
    const today = LocalDate.fromDate(this.clock.now(), this.settings.timeZone);
    let result: SetCirclePauseResult | null = null;
    await this.cycles.withLock(
      command.circleId,
      (stored) => {
        const cycle = CircleCycle.restore({
          ...stored,
          dueDay: this.settings.dueDay,
          delinquency: this.settings.delinquency,
          fund: { balance: stored.fundBalance, feeShareBps: this.settings.fundFeeShareBps },
          members: stored.members.map(({ userId, position, price, deductPayIn }) => ({
            userId,
            position,
            quote: this.pricing.quoteOf(stored.terms, position, price),
            deductPayInFromPayout: deductPayIn ?? false,
          })),
        });
        const by = { actorId: command.actorId, reason };
        const changed =
          command.action === 'pause' ? cycle.pause(today, by) : cycle.resume(today, by);
        result = {
          state: cycle.state,
          changed,
          startsOn: cycle.terms.startsOn.toString(),
          endsOn: cycle.terms.endsOn.toString(),
        };
        return Promise.resolve(cycle);
      },
      { wait: true },
    );
    const done = result!;
    if (done.changed) {
      // Auditoría y alerta: los demás super_admin y los miembros se avisan con las
      // notificaciones del back-office (fase 1), que todavía no existen.
      this.logger.warn({
        event: command.action === 'pause' ? 'circles.admin.paused' : 'circles.admin.resumed',
        circleId: command.circleId,
        actorId: command.actorId,
        reason,
        startsOn: done.startsOn,
        endsOn: done.endsOn,
      });
    }
    return done;
  }
}
