import { Logger } from '@nestjs/common';

import { type CircleCycleRepositoryPort } from '@src/modules/circles/application/ports/circle-cycle-repository.port';
import {
  type ContributionsPort,
  type DisbursementsPort,
} from '@src/modules/circles/application/ports/cycle-payments.port';
import { type CycleRunsPort } from '@src/modules/circles/application/ports/cycle-runs.port';
import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { type SlotPricing } from '@src/modules/circles/domain/services/slot-pricing';
import { TestClock } from '@test/support/create-test-app';

const SETTINGS = {
  dueDay: 5,
  timeZone: 'America/Lima',
  delinquency: {} as never,
  fundFeeShareBps: 0,
  startApprovalDays: 7,
};

/** Dos círculos pendientes: uno avanza y el otro falla. */
function cycles(): CircleCycleRepositoryPort {
  return {
    listToAdvance: () => Promise.resolve(['c-ok', 'c-falla']),
    withLock: (circleId: string) =>
      circleId === 'c-ok'
        ? Promise.resolve(false)
        : Promise.reject(new Error(`No se pudo cobrar ${'x'.repeat(400)}`)),
  };
}

function useCase(runs?: CycleRunsPort) {
  const clock = new TestClock(new Date('2026-12-01T17:00:00Z'));
  return new AdvanceCircleCyclesUseCase(
    cycles(),
    {} as SlotPricing,
    SETTINGS,
    {} as ContributionsPort,
    {} as DisbursementsPort,
    clock,
    runs,
  );
}

beforeEach(() => {
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('registro de las ejecuciones del ciclo mensual', () => {
  it('guarda el resumen con el día del negocio y los círculos que fallaron', async () => {
    const record = jest.fn(() => Promise.resolve());
    const result = await useCase({ record, list: jest.fn() }).execute();

    expect(result).toEqual({ advanced: 0, locked: 1, failed: 1 });
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({
        businessDate: '2026-12-01',
        advanced: 0,
        locked: 1,
        failed: 1,
        failures: [{ circleId: 'c-falla', reason: expect.stringMatching(/^No se pudo cobrar/) }],
      }),
    );
    const [run] = (record.mock.calls as unknown as [{ failures: { reason: string }[] }][])[0]!;
    expect(run.failures[0]!.reason.length).toBe(300);
  });

  it('si no se puede guardar, la ejecución termina igual y solo avisa', async () => {
    const error = jest.spyOn(Logger.prototype, 'error');
    const record = jest.fn(() => Promise.reject(new Error('base caída')));
    await expect(useCase({ record, list: jest.fn() }).execute()).resolves.toMatchObject({
      failed: 1,
    });
    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'circles.cycle.run_record_failed' }),
    );
  });

  it('sin registro configurado, funciona como antes', async () => {
    await expect(useCase().execute()).resolves.toEqual({ advanced: 0, locked: 1, failed: 1 });
  });
});
