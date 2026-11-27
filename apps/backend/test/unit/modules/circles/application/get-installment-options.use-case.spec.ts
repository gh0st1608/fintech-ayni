import { type JoinConfigRepositoryPort } from '@src/modules/circles/application/ports/join-config-repository.port';
import { GetInstallmentOptionsUseCase } from '@src/modules/circles/application/use-cases/get-installment-options.use-case';
import { JoinConfig } from '@src/modules/circles/domain/entities/join-config';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { PayoutRange } from '@src/modules/circles/domain/value-objects/payout-range';
import { Money } from '@src/shared/domain/value-objects/money';

/**
 * Las cuotas que se ofrecen para un monto (COPAYNI-29, 115 y 125).
 *
 * El caso de uso añade tres cosas a la aritmética del dominio: las dos puertas de la cadencia
 * —bandera del servidor y capacidad del cliente—, la duración derivada de esa cadencia, y el
 * monto cercano que sí existe cuando el elegido no se reparte exacto en ninguna duración.
 */
const pen = (amount: number) => Money.of(amount, 'PEN');

const RANGE = PayoutRange.create({ min: pen(300_000), max: pen(12_000_000), step: pen(50_000) });

const principal = { userId: 'u-1' };

const configWith = (turns: {
  durationOptions?: number[];
  turnRange?: { min: number; max: number };
}) =>
  JoinConfig.create({
    payoutRange: RANGE,
    savingProgramMax: pen(100_000_000),
    userPayoutLimit: null,
    ...turns,
  });

const useCaseFor = (
  config: JoinConfig,
  cadences: readonly Cadence[] = [Cadence.monthly],
): GetInstallmentOptionsUseCase => {
  const joinConfigs: JoinConfigRepositoryPort = { getForUser: () => Promise.resolve(config) };
  return new GetInstallmentOptionsUseCase(joinConfigs, { cadences });
};

describe('GetInstallmentOptionsUseCase', () => {
  it('ofrece las duraciones de hoy en mensual, con su cuota', async () => {
    const useCase = useCaseFor(configWith({ durationOptions: [6, 10, 12] }));

    const result = await useCase.execute(principal, 3_000_000);

    expect(result.cadence).toBe('monthly');
    expect(result.options.map(({ turns, months }) => [turns, months])).toEqual([
      [6, 6],
      [10, 10],
      [12, 12],
    ]);
    expect(result.alternatives).toEqual([]);
  });

  it('con el rango configurado ofrece solo las combinaciones que existen', async () => {
    const useCase = useCaseFor(configWith({ turnRange: { min: 2, max: 24 } }));

    const { options } = await useCase.execute(principal, 1_200_000);

    expect(options.map(({ turns }) => turns)).toEqual([2, 3, 4, 5, 6, 8, 10, 12, 15, 16, 20, 24]);
    // 7, 9, 11, 13 y 14 no dividen 12.000 en céntimos exactos y no se ofrecen.
    expect(options.map(({ turns }) => turns)).not.toContain(7);
  });

  it('un monto sin ninguna duración exacta responde con los montos cercanos que sí existen', async () => {
    const useCase = useCaseFor(configWith({ durationOptions: [7, 9] }));

    const { options, alternatives } = await useCase.execute(principal, 1_200_000);

    expect(options).toEqual([]);
    expect(alternatives.map(({ payout }) => payout.amount)).toEqual([1_050_000, 1_350_000]);
    expect(alternatives[0]?.options[0]).toMatchObject({ turns: 7, unit: 'Mes' });
  });

  it('calcula las cuotas en la cadencia pedida, con su unidad', async () => {
    const useCase = useCaseFor(configWith({ durationOptions: [12] }), [
      Cadence.monthly,
      Cadence.weekly,
    ]);

    const result = await useCase.execute(principal, 1_200_000, undefined, 'weekly', [
      Cadence.weekly,
    ]);

    expect(result.cadence).toBe('weekly');
    expect(result.options[0]).toMatchObject({
      turns: 12,
      unit: 'Semana',
      approximateDays: 84,
      installment: pen(100_000),
    });
  });

  it('no calcula cuotas de una cadencia deshabilitada en el servidor', async () => {
    const useCase = useCaseFor(configWith({ durationOptions: [12] }));

    await expect(
      useCase.execute(principal, 1_200_000, undefined, 'weekly', [Cadence.weekly]),
    ).rejects.toMatchObject({ details: { cadence: 'not_enabled' } });
  });

  it('no calcula cuotas de una cadencia que el cliente no sabe mostrar', async () => {
    // Habilitada en el servidor, pero la app no la declaró: enseñarle fechas semanales sería
    // enseñar cifras equivocadas sobre dinero real (COPAYNI-115).
    const useCase = useCaseFor(configWith({ durationOptions: [12] }), [
      Cadence.monthly,
      Cadence.weekly,
    ]);

    await expect(useCase.execute(principal, 1_200_000, undefined, 'weekly')).rejects.toMatchObject({
      details: { cadence: 'not_supported_by_client' },
    });
  });

  it('rechaza un monto fuera del rango o del salto', async () => {
    const useCase = useCaseFor(configWith({ durationOptions: [6, 10, 12] }));

    await expect(useCase.execute(principal, 1_200_001)).rejects.toMatchObject({
      code: 'PAYOUT_NOT_ALLOWED',
    });
  });
});
