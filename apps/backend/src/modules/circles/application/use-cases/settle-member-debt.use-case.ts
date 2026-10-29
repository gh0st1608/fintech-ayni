import { Inject, Injectable, Logger } from '@nestjs/common';

import { LedgerTransaction } from '../../domain/value-objects/ledger-transaction';
import { MEMBER_DEBTS, type MemberDebtsPort } from '../ports/member-debts.port';

/**
 * Salda la deuda de un expulsado cuando pagó lo vencido más el cargo por mora (COPAYNI-57): el
 * desbloqueo es automático (pending-scope R18). Lo invocará la confirmación del pago cuando
 * exista la pasarela (D1, COPAYNI-34); el desbloqueo manual del back-office, con 4-eyes, usará
 * este mismo caso de uso. Es idempotente: saldar dos veces no falla.
 *
 * Lo recuperado, lo vencido más el cargo por mora, vuelve al fondo de garantía (COPAYNI-58,
 * pending-scope §3.1).
 */
@Injectable()
export class SettleMemberDebtUseCase {
  private readonly logger = new Logger('Circles');

  constructor(@Inject(MEMBER_DEBTS) private readonly debts: MemberDebtsPort) {}

  async execute(command: { userId: string; circleId: string }): Promise<boolean> {
    const { userId, circleId } = command;
    const settled = await this.debts.settle(userId, circleId, ({ overdue, lateFee }) =>
      LedgerTransaction.create({
        key: `debt_recovered:${circleId}:${userId}`,
        kind: 'debt_recovered',
        circleId,
        entries: [
          { account: 'external', userId, amount: overdue.add(lateFee).times(-1) },
          { account: 'guarantee_fund', amount: overdue.add(lateFee) },
        ],
      }),
    );
    if (!settled) return false;
    this.logger.log({
      event: 'circles.debt_settled',
      ...command,
      recovered: settled.overdue.add(settled.lateFee).amount,
    });
    return true;
  }
}
