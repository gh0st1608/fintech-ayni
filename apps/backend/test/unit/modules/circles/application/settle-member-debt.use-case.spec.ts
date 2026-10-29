import { Logger } from '@nestjs/common';

import { SettleMemberDebtUseCase } from '@src/modules/circles/application/use-cases/settle-member-debt.use-case';

describe('SettleMemberDebtUseCase', () => {
  afterEach(() => jest.restoreAllMocks());

  it('salda la deuda una sola vez y lo registra en la auditoría', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const open = new Set(['ana:c-1']);
    const useCase = new SettleMemberDebtUseCase({
      openDebtsOf: () => Promise.resolve([]),
      settle: (userId, circleId) => Promise.resolve(open.delete(`${userId}:${circleId}`)),
    });

    await expect(useCase.execute({ userId: 'ana', circleId: 'c-1' })).resolves.toBe(true);
    await expect(useCase.execute({ userId: 'ana', circleId: 'c-1' })).resolves.toBe(false);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith({
      event: 'circles.debt_settled',
      userId: 'ana',
      circleId: 'c-1',
    });
  });
});
