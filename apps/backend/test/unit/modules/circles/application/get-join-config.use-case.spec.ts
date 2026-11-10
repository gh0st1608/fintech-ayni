import { Test } from '@nestjs/testing';

import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '@src/modules/circles/application/ports/join-config-repository.port';
import { GetJoinConfigUseCase } from '@src/modules/circles/application/use-cases/get-join-config.use-case';
import { JoinConfig } from '@src/modules/circles/domain/entities/join-config';
import { PayoutRange } from '@src/modules/circles/domain/value-objects/payout-range';
import { Money } from '@src/shared/domain/value-objects/money';
import { InfrastructureError } from '@src/shared/errors/app-error';
import { CURRENCIES } from '@src/shared/application/ports/currencies.port';
import { TEST_CURRENCIES_WITH_USD } from '@test/support/join-circle.fixture';

const pen = (amount: number) => Money.of(amount, 'PEN');
const joinConfig = JoinConfig.create({
  payoutRange: PayoutRange.create({ min: pen(300_000), max: pen(600_000), step: pen(50_000) }),
  savingProgramMax: pen(1_000_000),
  userPayoutLimit: pen(400_000),
  durationOptions: [6, 12],
});

describe('GetJoinConfigUseCase', () => {
  async function setup() {
    const repository: jest.Mocked<JoinConfigRepositoryPort> = { getForUser: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        GetJoinConfigUseCase,
        { provide: JOIN_CONFIG_REPOSITORY, useValue: repository },
        { provide: CURRENCIES, useValue: TEST_CURRENCIES_WITH_USD },
      ],
    }).compile();
    return { useCase: moduleRef.get(GetJoinConfigUseCase), repository };
  }

  it('devuelve la configuración del usuario autenticado y las monedas habilitadas', async () => {
    const { useCase, repository } = await setup();
    repository.getForUser.mockResolvedValue(joinConfig);

    await expect(useCase.execute({ userId: 'user-1' })).resolves.toEqual({
      config: joinConfig,
      currencies: [
        { code: 'PEN', official: true, rateToOfficial: '1' },
        { code: 'USD', official: false, rateToOfficial: '3.75' },
      ],
    });
    expect(repository.getForUser).toHaveBeenCalledWith('user-1', undefined);
  });

  it('pide la configuración en la moneda elegida', async () => {
    const { useCase, repository } = await setup();
    repository.getForUser.mockResolvedValue(joinConfig);

    await useCase.execute({ userId: 'user-1' }, 'USD');
    expect(repository.getForUser).toHaveBeenCalledWith('user-1', 'USD');
  });

  it('propaga los fallos del repositorio', async () => {
    const { useCase, repository } = await setup();
    repository.getForUser.mockRejectedValue(new InfrastructureError('db caída'));

    await expect(useCase.execute({ userId: 'user-1' })).rejects.toBeInstanceOf(InfrastructureError);
  });
});
