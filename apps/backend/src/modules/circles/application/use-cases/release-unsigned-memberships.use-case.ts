import { Inject, Injectable, Logger } from '@nestjs/common';

import { CIRCLE_REPOSITORY, type CircleRepositoryPort } from '../ports/circle-repository.port';
import {
  MEMBERSHIP_AGREEMENTS,
  type MembershipAgreementsPort,
} from '../ports/membership-agreements.port';

export interface ReleaseUnsignedResult {
  /** Acuerdos que pasaron a `expired`. */
  expired: number;
  /** Turnos que quedaron libres otra vez. */
  released: number;
}

/**
 * Libera el turno de quien se unió y no firmó el contrato y el pagaré dentro del plazo
 * (COPAYNI-89, 48 h). La corre la tarea diaria antes de avanzar los ciclos, así un turno liberado
 * ya cuenta como libre cuando se evalúa si el círculo puede empezar.
 *
 * El acuerdo queda en `expired` y es el registro de lo que pasó: quién reservó qué turno y cuándo
 * lo dejó vencer. La membresía se quita, con lo que el turno vuelve a estar disponible en `slots`
 * sin tocar su lógica, porque la disponibilidad se calcula sobre `circle_memberships`.
 *
 * Un turno que no se puede liberar no detiene a los demás.
 */
@Injectable()
export class ReleaseUnsignedMembershipsUseCase {
  private readonly logger = new Logger('Agreements');

  constructor(
    @Inject(MEMBERSHIP_AGREEMENTS) private readonly agreements: MembershipAgreementsPort,
    @Inject(CIRCLE_REPOSITORY) private readonly circles: CircleRepositoryPort,
  ) {}

  async execute(): Promise<ReleaseUnsignedResult> {
    const expired = await this.agreements.expire();
    let released = 0;
    for (const membership of expired) {
      try {
        const removed = await this.circles.removeMembership(membership.circleId, membership.userId);
        if (removed) released += 1;
        this.logger.warn({
          event: 'agreements.membership_released',
          userId: membership.userId,
          circleId: membership.circleId,
          position: membership.position,
          removed,
        });
      } catch (error) {
        this.logger.error({
          event: 'agreements.release_failed',
          circleId: membership.circleId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { expired: expired.length, released };
  }
}
