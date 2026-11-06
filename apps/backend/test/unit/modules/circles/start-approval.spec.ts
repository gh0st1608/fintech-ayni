import { Logger } from '@nestjs/common';

import { type StoredCycle } from '@src/modules/circles/application/ports/circle-cycle-repository.port';
import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import {
  newPositions,
  reducedTerms,
  resolveStart,
} from '@src/modules/circles/domain/services/start-approval';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleCycleRepository } from '@test/support/in-memory-circle-cycle.repository';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING,
} from '@test/support/join-circle.fixture';

/** 10 turnos de 300 con cuota base de 30, desde noviembre de 2026. */
const TERMS = CircleTerms.create({
  payout: Money.of(30_000, 'PEN'),
  months: 10,
  startsOn: Period.of(2026, 11),
});
const CIRCLE = 'c-1';

/** Lima es UTC-5: las 17:00 UTC son mediodía del día indicado. */
const at = (date: string) => new Date(`${date}T17:00:00Z`);

function setup(members: StoredCycle['members']) {
  const cycles = new InMemoryCircleCycleRepository();
  cycles.add({
    circleId: CIRCLE,
    terms: TERMS,
    state: 'collecting',
    currentPeriod: null,
    members,
    installments: [],
  });
  const payments = new FakeCyclePayments();
  const clock = new TestClock(at('2026-11-01'));
  const useCase = new AdvanceCircleCyclesUseCase(
    cycles,
    TEST_PRICING,
    {
      dueDay: 5,
      timeZone: 'America/Lima',
      delinquency: TEST_DELINQUENCY,
      fundFeeShareBps: TEST_FUND_SHARE_BPS,
      startApprovalDays: 7,
    },
    payments,
    payments,
    clock,
  );
  return { cycles, useCase, clock };
}

/** 7 de 10 turnos ocupados, con huecos: 2, 3, 5, 6, 7, 8 y 10. */
const SEVEN = [2, 3, 5, 6, 7, 8, 10].map((position) => ({ userId: `u-${position}`, position }));

describe('reducción de un círculo incompleto (COPAYNI-62)', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('mantiene la cuota base y baja el pozo', () => {
    const terms = reducedTerms(TERMS, 7)!;
    expect(terms.months).toBe(7);
    expect(terms.payout.amount).toBe(21_000);
    expect(terms.baseInstallment.amount).toBe(TERMS.baseInstallment.amount);
  });

  it('con menos de 2 miembros no hay círculo', () => {
    expect(reducedTerms(TERMS, 1)).toBeNull();
  });

  it('los turnos conservan su orden relativo, sin huecos', () => {
    expect(newPositions(SEVEN).get('u-2')).toBe(1);
    expect(newPositions(SEVEN).get('u-10')).toBe(7);
  });

  it('llegado el mes de inicio propone la reducción y no cobra nada', async () => {
    const { cycles, useCase } = setup(SEVEN);
    await useCase.execute();

    const stored = cycles.get(CIRCLE)!;
    expect(stored.state).toBe('approving');
    expect(stored.approval?.terms.months).toBe(7);
    expect(stored.approval?.terms.payout.amount).toBe(21_000);
    expect(stored.approval?.respondBy.toString()).toBe('2026-11-08');
    expect(stored.terms.months).toBe(10);
    expect(cycles.installments.size).toBe(0);
  });

  it('con un solo miembro cancela: nadie paga', async () => {
    const { cycles, useCase } = setup([{ userId: 'u-1', position: 1 }]);
    await useCase.execute();
    expect(cycles.get(CIRCLE)?.state).toBe('cancelled');
    expect(cycles.get(CIRCLE)?.members).toEqual([]);
    expect(cycles.installments.size).toBe(0);
  });

  it('espera mientras falten respuestas y siga el plazo', async () => {
    const { cycles, useCase, clock } = setup(SEVEN);
    await useCase.execute();
    cycles.respond(CIRCLE, 'u-2', 'accepted');
    clock.set(at('2026-11-08'));
    await useCase.execute();
    expect(cycles.get(CIRCLE)?.state).toBe('approving');
  });

  it('si todos aceptan empieza con las condiciones nuevas, congeladas', async () => {
    const { cycles, useCase, clock } = setup(SEVEN);
    await useCase.execute();
    SEVEN.forEach(({ userId }) => cycles.respond(CIRCLE, userId, 'accepted'));
    clock.set(at('2026-11-03'));
    await useCase.execute();

    const stored = cycles.get(CIRCLE)!;
    expect(stored.state).toBe('contributing');
    expect(stored.terms.months).toBe(7);
    expect(stored.terms.payout.amount).toBe(21_000);
    expect(stored.terms.startsOn.toString()).toBe('2026-11');
    expect(stored.members.map(({ position }) => position).sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const first = stored.members.find(({ userId }) => userId === 'u-2')!;
    expect(first.position).toBe(1);
    expect(first.price?.installments).toHaveLength(7);
    expect(stored.installments).toHaveLength(7);
  });

  it('si el vencimiento ya pasó, el calendario se corre un mes', async () => {
    const { cycles, useCase, clock } = setup(SEVEN);
    await useCase.execute();
    SEVEN.forEach(({ userId }) => cycles.respond(CIRCLE, userId, 'accepted'));
    clock.set(at('2026-11-06'));
    await useCase.execute();

    const stored = cycles.get(CIRCLE)!;
    expect(stored.terms.startsOn.toString()).toBe('2026-12');
    expect(stored.currentPeriod?.toString()).toBe('2026-12');
    expect(stored.installments.every(({ status }) => status === 'pending')).toBe(true);
  });

  it('quien no responde sale, y los demás deciden de nuevo con las condiciones nuevas', async () => {
    const { cycles, useCase, clock } = setup(SEVEN);
    await useCase.execute();
    SEVEN.slice(0, 5).forEach(({ userId }) => cycles.respond(CIRCLE, userId, 'accepted'));
    cycles.respond(CIRCLE, 'u-8', 'withdrawn');
    clock.set(at('2026-11-09'));
    await useCase.execute();

    const stored = cycles.get(CIRCLE)!;
    expect(stored.state).toBe('approving');
    expect(stored.members.map(({ userId }) => userId)).toEqual(
      SEVEN.slice(0, 5).map(({ userId }) => userId),
    );
    expect(stored.approval?.terms.months).toBe(5);
    expect(stored.approval?.terms.payout.amount).toBe(15_000);
    expect(stored.approval?.decisions.size).toBe(0);
    expect(stored.approval?.respondBy.toString()).toBe('2026-11-16');
    expect(cycles.installments.size).toBe(0);
  });

  it('si quedan menos de 2 aceptados, cancela', async () => {
    const { cycles, useCase, clock } = setup(SEVEN);
    await useCase.execute();
    cycles.respond(CIRCLE, 'u-2', 'accepted');
    clock.set(at('2026-11-09'));
    await useCase.execute();
    expect(cycles.get(CIRCLE)?.state).toBe('cancelled');
    expect(cycles.installments.size).toBe(0);
  });

  it('un retiro con todos los demás respondidos se resuelve sin esperar el plazo', () => {
    const approval = {
      terms: reducedTerms(TERMS, 3)!,
      respondBy: LocalDate.parse('2026-11-08'),
      decisions: new Map([
        ['a', 'accepted'],
        ['b', 'accepted'],
        ['c', 'withdrawn'],
      ] as const),
    };
    expect(resolveStart(approval, ['a', 'b', 'c'], LocalDate.parse('2026-11-02'))).toEqual({
      status: 'reopen',
      staying: ['a', 'b'],
    });
  });
});
