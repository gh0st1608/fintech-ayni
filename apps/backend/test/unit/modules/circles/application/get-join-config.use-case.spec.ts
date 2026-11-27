import { Test } from '@nestjs/testing';

import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '@src/modules/circles/application/ports/join-config-repository.port';
import { CIRCLE_ASSIGNMENT } from '@src/modules/circles/application/use-cases/assignment-settings';
import { GetJoinConfigUseCase } from '@src/modules/circles/application/use-cases/get-join-config.use-case';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
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

/** Solo la mensual, como en producción, salvo que una prueba habilite más (COPAYNI-121). */
const MONTHLY_ONLY = { strategy: 'fill_oldest' as const, cadences: [Cadence.monthly] };

describe('GetJoinConfigUseCase', () => {
  async function setup(assignment: { cadences: Cadence[] } = MONTHLY_ONLY) {
    const repository: jest.Mocked<JoinConfigRepositoryPort> = { getForUser: jest.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        GetJoinConfigUseCase,
        { provide: JOIN_CONFIG_REPOSITORY, useValue: repository },
        { provide: CURRENCIES, useValue: TEST_CURRENCIES_WITH_USD },
        { provide: CIRCLE_ASSIGNMENT, useValue: assignment },
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
      // Con la bandera por defecto solo se ofrece la mensual, y la app no muestra el paso de
      // frecuencia (COPAYNI-116).
      cadences: [{ id: 'monthly', unit: 'Mes', turnDays: 30, default: true }],
    });
    expect(repository.getForUser).toHaveBeenCalledWith('user-1', undefined);
  });

  it('ofrece la intersección de lo habilitado en el servidor y lo que declara el cliente', async () => {
    const { useCase, repository } = await setup({
      cadences: [Cadence.monthly, Cadence.weekly],
    });
    repository.getForUser.mockResolvedValue(joinConfig);

    // El cliente declara semanal y quincenal; la quincenal no está habilitada y no se ofrece.
    const offered = await useCase.execute({ userId: 'user-1' }, undefined, [
      Cadence.weekly,
      Cadence.biweekly,
    ]);
    expect(offered.cadences).toEqual([
      { id: 'weekly', unit: 'Semana', turnDays: 7, default: false },
    ]);

    // Y sin declarar nada, solo la mensual: es lo que hace la app publicada.
    const published = await useCase.execute({ userId: 'user-1' });
    expect(published.cadences.map(({ id }) => id)).toEqual(['monthly']);
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
