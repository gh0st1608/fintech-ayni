import { Logger } from '@nestjs/common';

import { type JoinCircleCommand } from '@src/modules/circles/application/use-cases/join-circle.use-case';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { Money } from '@src/shared/domain/value-objects/money';
import { InMemoryCircleRepository } from '@test/support/in-memory-circle.repository';
import {
  createJoinCircleUseCase,
  ELIGIBLE,
  TEST_TERMS_VERSION,
} from '@test/support/join-circle.fixture';

/**
 * El límite mensual de pay-in se mide por mes calendario (COPAYNI-110).
 *
 * El defecto que cubre esta prueba comparaba el límite contra **cada cuota por separado**. Con una
 * cuota por mes las dos lecturas coinciden por accidente; con cadencia semanal son cuatro o cinco
 * cuotas en el mismo mes, cada una pasaba el filtro y la persona se comprometía por cuatro o cinco
 * veces el límite que declaró. Y el límite es de la persona, no del círculo: unirse a un segundo
 * círculo sumaba por encima del límite sin que nadie lo mirara.
 */
const pen = (major: number) => Money.of(major * 100, 'PEN');

/** 30.000 en 10 turnos: cuota base de 3.000, y algo más con las Admin Fees del slot. */
const COMMAND: JoinCircleCommand = {
  userId: 'ana',
  circleId: null,
  payoutAmount: 3_000_000,
  months: 10,
  position: 3,
  idempotencyKey: 'key-ana-0000000001',
  termsVersion: TEST_TERMS_VERSION,
};

const withLimit = (
  limit: Money | null,
  circles: InMemoryCircleRepository,
  cadences = [Cadence.monthly],
) =>
  createJoinCircleUseCase(circles, {
    applicant: { ...ELIGIBLE, monthlyPayInLimit: limit },
    assignment: { cadences },
  });

describe('Límite mensual de pay-in por mes calendario (COPAYNI-110)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('deja unirse a una junta mensual cuya cuota cabe en el límite, igual que antes', async () => {
    const circles = new InMemoryCircleRepository();
    const result = await withLimit(pen(5_000), circles).execute(COMMAND);

    // Una cuota por mes: el mes suma una sola cuota y la comparación es la de siempre.
    expect(result.quote.installments[0]!.amount).toBeLessThanOrEqual(pen(5_000).amount);
    expect(result.created).toBe(true);
  });

  it('sin límite declarado no se comprueba nada, igual que antes', async () => {
    const circles = new InMemoryCircleRepository();
    await expect(withLimit(null, circles).execute(COMMAND)).resolves.toMatchObject({
      created: true,
    });
  });

  it('rechaza la junta semanal cuyas cuotas del mes suman más que el límite', async () => {
    // Mismo pozo y mismo límite que el caso mensual aceptado: lo único que cambia es que las
    // cuotas caen juntas en el mes. Cada una por separado cabía, y así se aceptaba.
    const circles = new InMemoryCircleRepository();
    const useCase = withLimit(pen(5_000), circles, [Cadence.monthly, Cadence.weekly]);

    // La junta semanal arranca una semana después de hoy (15 de octubre), no el 1 de noviembre:
    // el desplazamiento de inicio va en pasos de la cadencia (COPAYNI-114). Así que el primer mes
    // que se pasa es octubre, y es el que el error nombra.
    await expect(useCase.execute({ ...COMMAND, cadence: 'weekly' })).rejects.toThrow(
      expect.objectContaining({
        code: 'MONTHLY_LIMIT_EXCEEDED',
        // Cinco cuotas semanales caen en noviembre; el importe exacto depende de las Admin Fees
        // del slot, así que lo que se fija es el mes y que se pase de verdad.
        details: expect.objectContaining({ month: '2026-10', currency: 'PEN' }),
      }),
    );
  });

  it('cuenta lo que ya paga en otros círculos: el límite es de la persona', async () => {
    const circles = new InMemoryCircleRepository();
    // Con un límite de 7.000 cabe una cuota de ~3.400, y no caben dos.
    const useCase = withLimit(pen(7_000), circles);
    await useCase.execute(COMMAND);

    await expect(
      useCase.execute({ ...COMMAND, circleId: null, idempotencyKey: 'key-ana-0000000002' }),
    ).rejects.toThrow(
      expect.objectContaining({
        code: 'MONTHLY_LIMIT_EXCEEDED',
        details: expect.objectContaining({ currency: 'PEN' }),
      }),
    );
  });

  it('con sitio para los dos, el segundo círculo entra', async () => {
    const circles = new InMemoryCircleRepository();
    const useCase = withLimit(pen(9_000), circles);
    await useCase.execute(COMMAND);

    await expect(
      useCase.execute({ ...COMMAND, idempotencyKey: 'key-ana-0000000002' }),
    ).resolves.toMatchObject({ created: true });
  });
});
