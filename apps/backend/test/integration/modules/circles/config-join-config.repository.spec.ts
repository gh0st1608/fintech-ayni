import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { validateEnvironment } from '@src/config/env.validation';
import { type JoinConfigRepositoryPort } from '@src/modules/circles/application/ports/join-config-repository.port';
import { ConfigJoinConfigRepository } from '@src/modules/circles/infrastructure/persistence/config-join-config.repository';
import { CurrencyModule } from '@src/shared/infrastructure/currency/currency.module';

import { TEST_ENV } from '../../../setup-env';

/** Adaptador real con ConfigModule real: valida la integración entre configuración y dominio. */
async function createRepository(
  overrides: Record<string, string> = {},
): Promise<JoinConfigRepositoryPort> {
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        ignoreEnvVars: true,
        validate: () => validateEnvironment({ ...TEST_ENV, ...overrides }),
      }),
      CurrencyModule,
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
    const config = await (
      await createRepository({
        DEFAULT_CURRENCY: 'USD',
        SUPPORTED_CURRENCIES: '',
        EXCHANGE_RATES: '',
      })
    ).getForUser('u');
    expect(config.payoutRange.currency).toBe('USD');
    expect(config.savingProgramMax.currency).toBe('USD');
  });

  it('deriva los montos en USD con el tipo de cambio fijo, en saltos parejos (M6)', async () => {
    const repository = await createRepository({
      SUPPORTED_CURRENCIES: 'PEN,USD',
      EXCHANGE_RATES: 'USD:3.75',
    });
    const config = await repository.getForUser('u', 'USD');

    // PEN 3.000–120.000 en saltos de 500 → USD 800–32.000 en saltos de 100.
    expect(config.payoutRange.min).toMatchObject({ amount: 80_000, currency: 'USD' });
    expect(config.payoutRange.max).toMatchObject({ amount: 3_200_000, currency: 'USD' });
    expect(config.payoutRange.step).toMatchObject({ amount: 10_000, currency: 'USD' });
    // PEN 1.000.000 → USD 266.666, hacia abajo y en unidades enteras.
    expect(config.savingProgramMax).toMatchObject({ amount: 26_666_600, currency: 'USD' });
    expect((await repository.getForUser('u')).payoutRange.currency).toBe('PEN');
  });

  it('rechaza una moneda que no está habilitada', async () => {
    const repository = await createRepository({ SUPPORTED_CURRENCIES: '' });
    await expect(repository.getForUser('u', 'USD')).rejects.toMatchObject({
      details: { currency: 'not_supported' },
    });
  });

  it('impide arrancar con una moneda habilitada sin tipo de cambio', async () => {
    await expect(
      createRepository({ SUPPORTED_CURRENCIES: 'PEN,USD', EXCHANGE_RATES: '' }),
    ).rejects.toThrow(/EXCHANGE_RATES: Falta el tipo de cambio de USD/);
  });

  it('impide arrancar si la moneda oficial no está habilitada', async () => {
    await expect(
      createRepository({ SUPPORTED_CURRENCIES: 'USD', EXCHANGE_RATES: 'USD:3.75' }),
    ).rejects.toThrow(/debe incluir la moneda oficial/);
  });

  it('impide arrancar con un rango de payout inválido', async () => {
    await expect(createRepository({ JOIN_PAYOUT_MAX: '12000001' })).rejects.toMatchObject({
      code: 'INVALID_PAYOUT_RANGE',
    });
  });
});
