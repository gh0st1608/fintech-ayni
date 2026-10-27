import { type ReadinessIndicator } from '@src/modules/health/application/ports/readiness-indicator.port';
import { CheckReadinessUseCase } from '@src/modules/health/application/use-cases/check-readiness.use-case';

const indicator = (name: string, isReady: () => Promise<boolean>): ReadinessIndicator => ({
  name,
  isReady,
});

describe('CheckReadinessUseCase', () => {
  it('está lista sin indicadores', async () => {
    await expect(new CheckReadinessUseCase([]).execute()).resolves.toEqual({
      ready: true,
      failing: [],
    });
  });

  it('está lista si todos los indicadores responden', async () => {
    const useCase = new CheckReadinessUseCase([
      indicator('database', () => Promise.resolve(true)),
      indicator('cache', () => Promise.resolve(true)),
    ]);

    await expect(useCase.execute()).resolves.toEqual({ ready: true, failing: [] });
  });

  it('no está lista si un indicador responde false, rechaza o excede el tiempo', async () => {
    const useCase = new CheckReadinessUseCase([
      indicator('ok', () => Promise.resolve(true)),
      indicator('database', () => Promise.resolve(false)),
      indicator('queue', () => Promise.reject(new Error('ECONNREFUSED'))),
      indicator('lento', () => new Promise<boolean>(() => undefined)),
    ]);

    await expect(useCase.execute(20)).resolves.toEqual({
      ready: false,
      failing: ['database', 'queue', 'lento'],
    });
  });
});
