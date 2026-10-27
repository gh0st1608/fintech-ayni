import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { validateEnvironment } from '@src/config/env.validation';
import { type JoinConfigRepositoryPort } from '@src/modules/circles/application/ports/join-config-repository.port';
import { ConfigJoinConfigRepository } from '@src/modules/circles/infrastructure/persistence/config-join-config.repository';

import { TEST_ENV } from '../../../setup-env';

/** Adaptador real con ConfigModule real: valida la integración entre configuración y dominio. */
async function createRepository(
  overrides: Record<string, string> = {},
): Promise<JoinConfigRepositoryPort> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        validate: () => validateEnvironment({ ...TEST_ENV, ...overrides }),
      }),
    ],
    providers: [ConfigJoinConfigRepository],
  }).compile();
  return moduleRef.get(ConfigJoinConfigRepository);
}

describe('ConfigJoinConfigRepository', () => {
  it('construye la configuración de unión con la moneda por defecto', async () => {
    const repository = await createRepository();
    const config = await repository.getForUser('user-1');

    expect(config.payoutRange.min).toMatchObject({ amount: 300_000, currency: 'PEN' });
    expect(config.payoutRange.max).toMatchObject({ amount: 12_000_000, currency: 'PEN' });
    expect(config.payoutRange.step).toMatchObject({ amount: 50_000, currency: 'PEN' });
    expect(config.savingProgramMax).toMatchObject({ amount: 100_000_000, currency: 'PEN' });
    expect(config.userPayoutLimit).toBeNull();
  });

  it('usa la moneda configurada para todos los montos', async () => {
    const config = await (await createRepository({ DEFAULT_CURRENCY: 'USD' })).getForUser('u');
    expect(config.payoutRange.currency).toBe('USD');
    expect(config.savingProgramMax.currency).toBe('USD');
  });

  it('impide arrancar con un rango de payout inválido', async () => {
    await expect(createRepository({ JOIN_PAYOUT_MAX: '12000001' })).rejects.toMatchObject({
      code: 'INVALID_PAYOUT_RANGE',
    });
  });
});
