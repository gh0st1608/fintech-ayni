import { Inject, Injectable, Logger } from '@nestjs/common';

import { MEMBER_DEBTS, type MemberDebtsPort } from '../ports/member-debts.port';

/**
 * Salda la deuda de un expulsado cuando pagó lo vencido más el cargo por mora (COPAYNI-57): el
 * desbloqueo es automático (pending-scope R18). Lo invocará la confirmación del pago cuando
 * exista la pasarela (D1, COPAYNI-34); el desbloqueo manual del back-office, con 4-eyes, usará
 * este mismo caso de uso. Es idempotente: saldar dos veces no falla.
 */
@Injectable()
export class SettleMemberDebtUseCase {
  private readonly logger = new Logger('Circles');

  constructor(@Inject(MEMBER_DEBTS) private readonly debts: MemberDebtsPort) {}

  async execute(command: { userId: string; circleId: string }): Promise<boolean> {
    const settled = await this.debts.settle(command.userId, command.circleId);
    if (settled) this.logger.log({ event: 'circles.debt_settled', ...command });
    return settled;
  }
}
