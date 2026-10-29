import { Logger } from '@nestjs/common';

import { type MemberDebt } from '@src/modules/circles/application/ports/member-debts.port';
import { SettleMemberDebtUseCase } from '@src/modules/circles/application/use-cases/settle-member-debt.use-case';
import { type LedgerTransaction } from '@src/modules/circles/domain/value-objects/ledger-transaction';
import { Money } from '@src/shared/domain/value-objects/money';

describe('SettleMemberDebtUseCase', () => {
  afterEach(() => jest.restoreAllMocks());

  it('salda la deuda una sola vez, devuelve lo recuperado al fondo y lo registra en la auditoría', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const debt: MemberDebt = {
      circleId: 'c-1',
      overdue: Money.of(300_000, 'PEN'),
      lateFee: Money.of(9_000, 'PEN'),
    };
    const open = new Map([['ana:c-1', debt]]);
    const recorded: LedgerTransaction[] = [];
    const useCase = new SettleMemberDebtUseCase({
      openDebtsOf: () => Promise.resolve([]),
      settle: (userId, circleId, recovery) => {
        const found = open.get(`${userId}:${circleId}`) ?? null;
        open.delete(`${userId}:${circleId}`);
        if (found) recorded.push(recovery(found));
        return Promise.resolve(found);
      },
    });

    await expect(useCase.execute({ userId: 'ana', circleId: 'c-1' })).resolves.toBe(true);
    await expect(useCase.execute({ userId: 'ana', circleId: 'c-1' })).resolves.toBe(false);

    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ key: 'debt_recovered:c-1:ana', kind: 'debt_recovered' });
    expect(recorded[0]!.netFor('guarantee_fund')).toEqual(Money.of(309_000, 'PEN'));
    expect(recorded[0]!.netFor('external')).toEqual(Money.of(-309_000, 'PEN'));
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({
      event: 'circles.debt_settled',
      userId: 'ana',
      circleId: 'c-1',
      recovered: 309_000,
    });
  });
});
