import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Logger } from '@nestjs/common';

import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import { SetCirclePauseUseCase } from '@src/modules/circles/application/use-cases/set-circle-pause.use-case';
import { CircleCycle, type CycleMember } from '@src/modules/circles/domain/entities/circle-cycle';
import { priceOf } from '@src/modules/circles/domain/services/slot-pricing';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { type StaffPrincipal } from '@src/shared/application/ports/staff-authenticator.port';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { UnconfiguredStaffAuthenticator } from '@src/shared/infrastructure/staff/unconfigured-staff-authenticator';
import { RequireStaff, StaffGuard } from '@src/shared/presentation/guards/staff.guard';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleCycleRepository } from '@test/support/in-memory-circle-cycle.repository';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING,
} from '@test/support/join-circle.fixture';

/** 3.000 en 3 meses desde noviembre de 2026; vence el día 5 con 3 días de gracia. */
const TERMS = CircleTerms.create({
  payout: Money.of(300_000, 'PEN'),
  months: 3,
  startsOn: Period.of(2026, 11),
});
const day = (value: string) => LocalDate.parse(value);
const at = (date: string) => new Date(`${date}T17:00:00Z`);
const BY = { actorId: 'staff-1', reason: 'Revisión de un reclamo' };
const member = (userId: string, position: number): CycleMember => ({
  userId,
  position,
  quote: TEST_PRICING.quote(TERMS, position),
});

let ids = 0;
const newId = () => `i-${++ids}`;

function running() {
  const cycle = CircleCycle.restore({
    circleId: 'c-1',
    terms: TERMS,
    dueDay: 5,
    delinquency: TEST_DELINQUENCY,
    fund: { balance: Money.zero('PEN'), feeShareBps: TEST_FUND_SHARE_BPS },
    state: 'collecting',
    currentPeriod: null,
    members: [member('ana', 1), member('beto', 2), member('caro', 3)],
    installments: [],
  });
  cycle.start(newId);
  return cycle;
}

describe('Pausa del ciclo (COPAYNI-61)', () => {
  it('pausa un círculo en curso una sola vez y registra el antes y el después', () => {
    const cycle = running();
    expect(cycle.pause(day('2026-11-03'), BY)).toBe(true);
    expect(cycle.pause(day('2026-11-04'), BY)).toBe(false);

    expect(cycle.state).toBe('paused');
    expect(cycle.pausedOn).toEqual(day('2026-11-03'));
    expect(cycle.dueInstallments(day('2026-11-05'))).toEqual([]);
    expect(cycle.adminEvents).toEqual([
      {
        action: 'pause',
        ...BY,
        on: day('2026-11-03'),
        before: {
          state: 'contributing',
          startsOn: '2026-11',
          endsOn: '2027-01',
          currentPeriod: '2026-11',
        },
        after: {
          state: 'paused',
          startsOn: '2026-11',
          endsOn: '2027-01',
          currentPeriod: '2026-11',
        },
      },
    ]);
  });

  it('solo se pausa un círculo en curso y solo se reanuda uno pausado', () => {
    const collecting = CircleCycle.restore({
      circleId: 'c-2',
      terms: TERMS,
      dueDay: 5,
      delinquency: TEST_DELINQUENCY,
      fund: { balance: Money.zero('PEN'), feeShareBps: TEST_FUND_SHARE_BPS },
      state: 'collecting',
      currentPeriod: null,
      members: [],
      installments: [],
    });
    for (const action of [
      () => collecting.pause(day('2026-11-03'), BY),
      () => collecting.resume(day('2026-11-03'), BY),
    ]) {
      expect(action).toThrow(expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }));
    }
    expect(running().resume(day('2026-11-03'), BY)).toBe(false);
  });

  it('en el mismo mes, las cuotas que vencían en la pausa vencen al reanudar', () => {
    const cycle = running();
    cycle.pause(day('2026-11-03'), BY);
    expect(cycle.resume(day('2026-11-10'), BY)).toBe(true);

    expect(cycle.state).toBe('contributing');
    expect(cycle.calendarShift).toBe(0);
    expect(cycle.installments.map(({ dueOn }) => dueOn.toString())).toEqual([
      '2026-11-10',
      '2026-11-10',
      '2026-11-10',
    ]);
    // La gracia empieza a correr al reanudar: no se expulsa por los días de pausa.
    expect(cycle.dueInstallments(day('2026-11-10'))).toHaveLength(3);
  });

  it('una cuota en gracia al pausar no pierde los días de pausa', () => {
    const cycle = running();
    const [first] = cycle.dueInstallments(day('2026-11-05'));
    cycle.recordCollection(first!.id, 'failed');
    for (const { id } of cycle.dueInstallments(day('2026-11-05'))) {
      if (id !== first!.id) cycle.recordCollection(id, 'paid');
    }
    // Pausa el 6 (le quedaban 2 días de gracia) y reanuda el 7: vence el 6 + 1 = 7.
    cycle.pause(day('2026-11-06'), BY);
    cycle.resume(day('2026-11-07'), BY);
    const overdue = cycle.installments.find(({ id }) => id === first!.id)!;
    expect(overdue.dueOn).toEqual(day('2026-11-07'));
    expect(cycle.defaultedInstallments(day('2026-11-10'))).toEqual([]);
    expect(cycle.defaultedInstallments(day('2026-11-11'))).toHaveLength(1);
  });

  it('si la pausa pasa a otro mes, el calendario se corre ese número de meses', () => {
    const cycle = running();
    cycle.pause(day('2026-11-03'), BY);
    cycle.resume(day('2026-12-10'), BY);

    expect(cycle.calendarShift).toBe(1);
    expect(cycle.terms.startsOn).toEqual(Period.of(2026, 12));
    expect(cycle.terms.endsOn).toEqual(Period.of(2027, 2));
    expect(cycle.currentPeriod).toEqual(Period.of(2026, 12));
    // Vencen el 5 del mes nuevo, pero no antes de reanudar.
    expect(
      cycle.installments.map(({ period, dueOn }) => [period.toString(), dueOn.toString()]),
    ).toEqual([
      ['2026-12', '2026-12-10'],
      ['2026-12', '2026-12-10'],
      ['2026-12', '2026-12-10'],
    ]);
    expect(cycle.adminEvents[1]).toMatchObject({
      action: 'resume',
      before: { state: 'paused', startsOn: '2026-11', endsOn: '2027-01' },
      after: { state: 'contributing', startsOn: '2026-12', endsOn: '2027-02' },
    });
  });
});

describe('SetCirclePauseUseCase', () => {
  const settings = {
    dueDay: 5,
    timeZone: 'America/Lima',
    delinquency: TEST_DELINQUENCY,
    fundFeeShareBps: TEST_FUND_SHARE_BPS,
  };

  function setup() {
    const cycles = new InMemoryCircleCycleRepository();
    cycles.add({
      circleId: 'c-1',
      terms: TERMS,
      state: 'collecting',
      currentPeriod: null,
      members: [1, 2, 3].map((position) => ({
        userId: `u-${position}`,
        position,
        price: priceOf(TEST_PRICING.quote(TERMS, position)),
      })),
      installments: [],
    });
    const clock = new TestClock(at('2026-11-01'));
    const payments = new FakeCyclePayments();
    const advance = new AdvanceCircleCyclesUseCase(
      cycles,
      TEST_PRICING,
      settings,
      payments,
      payments,
      clock,
    );
    const pause = new SetCirclePauseUseCase(cycles, TEST_PRICING, settings, clock);
    return { cycles, clock, advance, pause };
  }

  beforeEach(() => {
    for (const level of ['log', 'warn'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('un círculo pausado no avanza; al reanudar en otro mes se corre y sigue', async () => {
    const { cycles, clock, advance, pause } = setup();
    await advance.execute();
    clock.set(at('2026-11-03'));
    const warn = jest.spyOn(Logger.prototype, 'warn');
    await expect(
      pause.execute({ circleId: 'c-1', action: 'pause', actorId: 'staff-1', reason: ' Reclamo ' }),
    ).resolves.toEqual({ state: 'paused', changed: true, startsOn: '2026-11', endsOn: '2027-01' });
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'circles.admin.paused',
        actorId: 'staff-1',
        reason: 'Reclamo',
      }),
    );
    // Pausar dos veces no genera otro evento.
    await expect(
      pause.execute({ circleId: 'c-1', action: 'pause', actorId: 'staff-2', reason: 'Otra vez' }),
    ).resolves.toMatchObject({ changed: false });
    expect(cycles.adminEvents).toHaveLength(1);

    clock.set(at('2026-11-20'));
    await advance.execute();
    expect(cycles.payouts).toEqual([]);

    clock.set(at('2026-12-02'));
    await expect(
      pause.execute({ circleId: 'c-1', action: 'resume', actorId: 'staff-1', reason: 'Resuelto' }),
    ).resolves.toEqual({
      state: 'contributing',
      changed: true,
      startsOn: '2026-12',
      endsOn: '2027-02',
    });
    clock.set(at('2026-12-05'));
    await advance.execute();
    expect(cycles.payouts.map(({ period }) => period.toString())).toEqual(['2026-12']);
    expect(cycles.adminEvents.map(({ action }) => action)).toEqual(['pause', 'resume']);
  });

  it('exige motivo y un círculo existente', async () => {
    const { pause } = setup();
    await expect(
      pause.execute({ circleId: 'c-1', action: 'pause', actorId: 'staff-1', reason: '  ' }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(
      pause.execute({ circleId: 'otro', action: 'pause', actorId: 'staff-1', reason: 'x' }),
    ).rejects.toMatchObject({ code: 'CIRCLE_NOT_FOUND' });
    await expect(
      pause.execute({ circleId: 'c-1', action: 'pause', actorId: 'staff-1', reason: 'x' }),
    ).rejects.toMatchObject({ code: 'INVALID_CYCLE_TRANSITION' });
  });
});

describe('StaffGuard', () => {
  const NOW = new Date('2026-11-02T15:00:00Z');
  const staff = (overrides: Partial<StaffPrincipal> = {}): StaffPrincipal => ({
    staffId: 'staff-1',
    roles: ['super_admin'],
    authenticatedAt: new Date(NOW.getTime() - 60_000),
    ...overrides,
  });

  class Routes {
    @RequireStaff('super_admin', { stepUp: true })
    critical(): void {}

    @RequireStaff('support')
    read(): void {}

    undeclared(): void {}
  }

  function context(handler: keyof Routes, authorization?: string) {
    const request: Record<string, unknown> = { headers: { authorization } };
    const ctx = {
      getHandler: () => Routes.prototype[handler],
      getClass: () => Routes,
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    return { ctx, request };
  }

  const guard = (principal: StaffPrincipal | null) =>
    new StaffGuard(
      new Reflector(),
      principal
        ? { authenticate: () => Promise.resolve(principal) }
        : new UnconfiguredStaffAuthenticator(),
      { stepUpMaxAgeSeconds: 300 },
      new TestClock(NOW),
    );

  it('deja pasar al super_admin con autenticación reciente y guarda quién es', async () => {
    const { ctx, request } = context('critical', 'Bearer staff-token');
    await expect(guard(staff()).canActivate(ctx)).resolves.toBe(true);
    expect(request.staff).toMatchObject({ staffId: 'staff-1' });
  });

  it.each([
    ['sin token', 'critical', undefined, staff(), 'UNAUTHORIZED'],
    ['sin autenticación del personal configurada', 'critical', 'Bearer x', null, 'UNAUTHORIZED'],
    [
      'con una autenticación vieja',
      'critical',
      'Bearer x',
      staff({ authenticatedAt: new Date(NOW.getTime() - 301_000) }),
      'UNAUTHORIZED',
    ],
    ['sin el rol', 'critical', 'Bearer x', staff({ roles: ['admin'] }), 'FORBIDDEN'],
    ['en una ruta sin rol declarado', 'undeclared', 'Bearer x', staff(), 'FORBIDDEN'],
  ] as const)('rechaza %s', async (_name, handler, authorization, principal, code) => {
    await expect(
      guard(principal).canActivate(context(handler, authorization).ctx),
    ).rejects.toMatchObject({
      code,
    });
  });

  it('sin step-up, una autenticación vieja sirve', async () => {
    const old = staff({ roles: ['support'], authenticatedAt: new Date(0) });
    await expect(guard(old).canActivate(context('read', 'Bearer x').ctx)).resolves.toBe(true);
  });
});
