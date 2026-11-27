import { Logger } from '@nestjs/common';

import { type StoredCycle } from '@src/modules/circles/application/ports/circle-cycle-repository.port';
import { type ContributionsPort } from '@src/modules/circles/application/ports/cycle-payments.port';
import { AdvanceCircleCyclesUseCase } from '@src/modules/circles/application/use-cases/advance-circle-cycles.use-case';
import {
  priceOf,
  retainedInstallments,
  SlotPricing,
} from '@src/modules/circles/domain/services/slot-pricing';
import { TurnSchedule } from '@src/modules/circles/domain/services/turn-schedule';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { FakeCyclePayments } from '@src/modules/circles/infrastructure/payments/cycle-payments';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { SlotPricingRules } from '@src/modules/circles/domain/value-objects/slot-pricing-rules';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import { TestClock } from '@test/support/create-test-app';
import { InMemoryCircleCycleRepository } from '@test/support/in-memory-circle-cycle.repository';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING_RULES,
} from '@test/support/join-circle.fixture';

/**
 * Regresión de la junta mensual (COPAYNI-122).
 *
 * La épica prometió no cambiar lo que ya funciona, y eso hay que demostrarlo con medidas, no con
 * argumentos. La referencia es el commit **91970af**, el anterior a la primera tarea de la épica
 * (`f386eb9`, COPAYNI-103): cada valor de abajo se recalcula aquí con la **expresión de entonces**,
 * citada en su comentario, y se compara contra lo que produce el código de hoy.
 *
 * Son tres cosas distintas y las tres hacen falta:
 *
 * 1. Las fórmulas: el cronograma, la cuota y la retención de una junta mensual.
 * 2. La junta que ya existía en la base, sin cadencia ni turno guardados, recorrida de principio
 *    a fin por el motor de ciclo real.
 * 3. Que con la bandera en su valor por defecto ninguna ruta llegue a una cadencia nueva.
 *
 * Lo que **no** cubre, y queda dicho en el ticket: la prueba de contrato contra las peticiones
 * reales de la app publicada, y la verificación sobre una copia de datos de producción. Ninguna
 * de las dos se puede hacer desde aquí.
 */
const pen = (amount: number) => Money.of(amount, 'PEN');

/** Lima es UTC-5: las 17:00 UTC son mediodía del día indicado. */
const at = (date: string) => new Date(`${date}T17:00:00Z`);

const DUE_DAY = 5;

/**
 * El precio con la retención de producción (`PAYOUT_RETENTION_COVERAGE_DAYS=60`). El fixture
 * compartido no configura retención, y aquí la retención es justo uno de los importes a medir.
 */
const PRICING = new SlotPricing(
  SlotPricingRules.create({ ...TEST_PRICING_RULES.props, retentionCoverageDays: 60 }),
);

/** La junta de referencia: 30.000 en 10 turnos desde noviembre de 2026. */
const TERMS = CircleTerms.create({
  payout: pen(3_000_000),
  turns: 10,
  startsOn: Period.of(2026, 11),
});

describe('Las fórmulas de una junta mensual no cambiaron (COPAYNI-122)', () => {
  it('la cuota base es el payout repartido en partes iguales', () => {
    // 91970af, circle-terms.ts: `const [baseInstallment] = payout.allocate(months)`.
    expect(TERMS.baseInstallment).toEqual(TERMS.payout.allocate(10)[0]);
    expect(TERMS.baseInstallment).toEqual(pen(300_000));
  });

  it('el mes de cobro de cada turno es el de arranque más su posición', () => {
    // 91970af, circle-terms.ts: `payoutPeriodOf(position) { return startsOn.addMonths(position - 1) }`.
    for (let position = 1; position <= 10; position += 1) {
      expect(TERMS.payoutPeriodOf(position)).toEqual(Period.of(2026, 11).addMonths(position - 1));
    }
    expect(TERMS.payoutPeriodOf(1).toString()).toBe('2026-11');
    expect(TERMS.payoutPeriodOf(10).toString()).toBe('2027-08');
  });

  it('el último turno sigue cayendo en el mismo mes', () => {
    // 91970af, circle-terms.ts: `get endsOn() { return startsOn.addMonths(months - 1) }`.
    expect(TERMS.endsOn).toEqual(Period.of(2026, 11).addMonths(9));
    expect(TERMS.endsOn.toString()).toBe('2027-08');
  });

  it('la cuota vence el día de la política, en el mes del turno', () => {
    // 91970af, circle-cycle.ts: `dueOn: LocalDate.of(period, this.dueDay)`, con los meses
    // avanzando uno a uno (`period.addMonths(1)`) desde `terms.startsOn`.
    const schedule = TurnSchedule.forCollection({
      startsOn: TERMS.startsOn,
      cadence: TERMS.cadence,
      turns: TERMS.turns,
      dueDay: DUE_DAY,
    });

    for (let turn = 1; turn <= 10; turn += 1) {
      const period = Period.of(2026, 11).addMonths(turn - 1);
      expect(schedule.dueOn(turn)).toEqual(LocalDate.of(period, DUE_DAY));
    }
    expect(schedule.dueOn(1).toString()).toBe('2026-11-05');
    expect(schedule.dueOn(10).toString()).toBe('2027-08-05');
  });

  it('la retención sigue siendo de dos cuotas con la cobertura configurada', () => {
    // 91970af, slot-pricing.ts: retenía `retentionInstallments` cuotas, con el valor 2 de
    // `PAYOUT_RETENTION_INSTALLMENTS`. Hoy la retención se expresa en días de cobertura
    // (COPAYNI-112) y 60 días de un turno mensual son esas mismas 2 cuotas.
    for (let position = 1; position <= 8; position += 1) {
      expect(retainedInstallments(PRICING.quote(TERMS, position), TERMS.baseInstallment)).toBe(2);
    }
    // Y a quien ya no le quedan cuotas por pagar no se le retiene más de lo que le queda.
    expect(retainedInstallments(PRICING.quote(TERMS, 9), TERMS.baseInstallment)).toBe(1);
    expect(PRICING.quote(TERMS, 10).retention.isZero()).toBe(true);
  });

  it('el precio de cada slot es el mismo importe a importe', () => {
    // El cálculo de fee y descuento no lo tocó la épica: entre 91970af y hoy, `slot-pricing.ts`
    // solo cambió la retención (COPAYNI-112) y el reparto de tipos con 2 o 3 slots
    // (COPAYNI-124), que no alcanza a ninguna junta existente. La tabla queda fijada aquí.
    const prices = PRICING.quoteAll(TERMS).map(
      ({ position, type, fee, discount, retention, netPayout }) => ({
        position,
        type,
        fee: fee.amount,
        discount: discount.amount,
        retention: retention.amount,
        netPayout: netPayout.amount,
      }),
    );

    expect(prices).toEqual([
      {
        position: 1,
        type: 'fastest_payout',
        fee: 300_000,
        discount: 0,
        retention: 600_000,
        netPayout: 2_400_000,
      },
      {
        position: 2,
        type: 'fastest_payout',
        fee: 150_000,
        discount: 0,
        retention: 600_000,
        netPayout: 2_400_000,
      },
      {
        position: 3,
        type: 'lowest_fees',
        fee: 0,
        discount: 0,
        retention: 600_000,
        netPayout: 2_400_000,
      },
      {
        position: 4,
        type: 'lowest_fees',
        fee: 0,
        discount: 0,
        retention: 600_000,
        netPayout: 2_400_000,
      },
      {
        position: 5,
        type: 'lowest_fees',
        fee: 0,
        discount: 0,
        retention: 600_000,
        netPayout: 2_400_000,
      },
      {
        position: 6,
        type: 'lowest_fees',
        fee: 0,
        discount: 0,
        retention: 600_000,
        netPayout: 2_400_000,
      },
      {
        position: 7,
        type: 'lowest_fees',
        fee: 0,
        discount: 0,
        retention: 600_000,
        netPayout: 2_400_000,
      },
      {
        position: 8,
        type: 'lowest_fees',
        fee: 0,
        discount: 0,
        retention: 600_000,
        netPayout: 2_400_000,
      },
      {
        position: 9,
        type: 'highest_return',
        fee: 0,
        discount: 75_000,
        retention: 300_000,
        netPayout: 2_700_000,
      },
      {
        position: 10,
        type: 'highest_return',
        fee: 0,
        discount: 150_000,
        retention: 0,
        netPayout: 3_000_000,
      },
    ]);
  });

  it('el reparto de tipos de slot es el de la fórmula anterior en las duraciones que existen', () => {
    // 91970af, slot-pricing.ts: `fastest: Math.floor((months * fastestShareBps) / 10_000)`, y lo
    // mismo para `highest`. COPAYNI-124 le puso un mínimo de un slot por grupo, que solo cambia
    // el reparto con 2 o 3 slots —duraciones que `CIRCLE_DURATION_OPTIONS` nunca ofreció—.
    const bps = 2_500;
    for (const turns of [6, 10, 12]) {
      const terms = CircleTerms.create({
        payout: pen(1_200_000),
        turns,
        startsOn: Period.of(2026, 11),
      });
      const types = PRICING.quoteAll(terms).map(({ type }) => type);
      const expected = Math.floor((turns * bps) / 10_000);

      expect(types.filter((type) => type === 'fastest_payout')).toHaveLength(expected);
      expect(types.filter((type) => type === 'highest_return')).toHaveLength(expected);
    }
  });

  it('la cuota de cada turno, con las Admin Fees repartidas, es la de siempre', () => {
    // `adminFeeMode: 'added_to_installments'`: el slot paga su fee en las cuotas hasta su cobro.
    // Se fijan las tres formas: el que cobra primero, uno del medio con reparto no exacto y el
    // que cobra último.
    const amountsOf = (position: number) =>
      PRICING.quote(TERMS, position).installments.map(({ amount }) => amount);

    expect(amountsOf(1)).toEqual([960_000, ...Array.from({ length: 9 }, () => 300_000)]);
    expect(amountsOf(7)).toEqual([
      351_429, 351_429, 351_429, 351_429, 351_428, 351_428, 351_428, 300_000, 300_000, 300_000,
    ]);
    expect(amountsOf(10)).toEqual(Array.from({ length: 10 }, () => 321_000));
  });

  it('una junta mensual arranca el día 1, como todas las que existen', () => {
    // COPAYNI-108: es la invariante que la base ya imponía antes de la épica.
    expect(TERMS.startsOn.toString()).toBe('2026-11-01');
    expect(TERMS.cadence.equals(Cadence.monthly)).toBe(true);
  });
});

describe('Una junta guardada antes de la épica recorre su ciclo igual (COPAYNI-122)', () => {
  /**
   * La fila como la dejó el código anterior: con su mes en curso y **sin** cadencia ni turno,
   * que son las columnas que añadió la expansión (COPAYNI-107). El ciclo deriva el turno del mes,
   * igual que el backfill, y es el riesgo real de regresión de toda la épica.
   */
  const storedBeforeEpic = (currentPeriod: Period): StoredCycle => ({
    circleId: 'c-1',
    terms: TERMS,
    state: 'contributing',
    currentPeriod,
    // currentTurn ausente a propósito: la columna estaba vacía.
    members: Array.from({ length: 10 }, (_unused, index) => ({
      userId: `u-${index + 1}`,
      position: index + 1,
      price: priceOf(PRICING.quote(TERMS, index + 1)),
    })),
    installments: [],
    fundBalance: pen(0),
    pendingRefunds: [],
    pausedOn: null,
  });

  function setup(currentPeriod: Period, contributions?: ContributionsPort) {
    const cycles = new InMemoryCircleCycleRepository();
    cycles.add(storedBeforeEpic(currentPeriod));
    const payments = new FakeCyclePayments();
    const clock = new TestClock(at('2027-01-01'));
    const advance = new AdvanceCircleCyclesUseCase(
      cycles,
      PRICING,
      {
        dueDay: DUE_DAY,
        timeZone: 'America/Lima',
        delinquency: TEST_DELINQUENCY,
        fundFeeShareBps: TEST_FUND_SHARE_BPS,
        startApprovalDays: 7,
      },
      contributions ?? payments,
      payments,
      clock,
    );
    const runOn = (date: string) => {
      clock.set(at(date));
      return advance.execute();
    };
    return { cycles, payments, runOn };
  }

  beforeEach(() => {
    for (const level of ['log', 'warn', 'debug'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation(() => undefined);
    }
  });
  afterEach(() => jest.restoreAllMocks());

  it('deriva el turno del mes guardado y cobra y paga el que toca', async () => {
    // Tercer mes de la junta: 2026-11 es el turno 1, así que 2027-01 es el 3.
    const { cycles, runOn } = setup(Period.of(2027, 1));

    await runOn('2027-01-05');

    expect(cycles.get('c-1')).toMatchObject({ currentTurn: 4, currentPeriod: Period.of(2027, 2) });
    expect(cycles.payouts.map(({ turn, userId }) => [turn, userId])).toEqual([[3, 'u-3']]);
  });

  it('las cuotas que abre vencen el día de la política, con el importe de cada precio', async () => {
    const { cycles, runOn } = setup(Period.of(2027, 1));

    await runOn('2027-01-05');
    const opened = [...cycles.installments.values()].filter(({ turn }) => turn === 3);

    expect(opened).toHaveLength(10);
    // Un solo vencimiento para todo el turno: el día 5 del mes del turno.
    expect(new Set(opened.map(({ dueOn }) => dueOn.toString()))).toEqual(new Set(['2027-01-05']));
    // Y el importe de cada miembro es la tercera cuota de su precio, Admin Fees incluidas.
    for (const { position, amount } of opened) {
      expect(amount).toEqual(PRICING.quote(TERMS, position).installments[2]);
    }
  });

  it('cierra en el mes del último turno, ni antes ni después', async () => {
    // Décimo turno: 2027-08. Arranca en el noveno para recorrer el cierre completo.
    const { cycles, runOn } = setup(Period.of(2027, 7));

    await runOn('2027-07-05');
    expect(cycles.get('c-1')).toMatchObject({ state: 'contributing', currentTurn: 10 });

    await runOn('2027-08-05');
    expect(cycles.get('c-1')).toMatchObject({ state: 'finished', currentPeriod: null });
    expect(cycles.payouts.map(({ turn, userId }) => [turn, userId])).toEqual([
      [9, 'u-9'],
      [10, 'u-10'],
    ]);
  });

  it('la morosidad corre con la gracia mensual de siempre', async () => {
    // TEST_DELINQUENCY son los 3 días de gracia de la configuración mensual: con la cuota
    // vencida el 5, el día 8 todavía se puede pagar y el 9 se expulsa. Es el comportamiento
    // previo a parametrizar la morosidad por cadencia (COPAYNI-111), que no tocó la mensual.
    const { cycles, runOn } = setup(Period.of(2027, 1), {
      collect: () => Promise.resolve('failed' as const),
    });

    await runOn('2027-01-05');
    expect(
      [...cycles.installments.values()].filter(({ status }) => status === 'overdue'),
    ).toHaveLength(10);

    await runOn('2027-01-08');
    expect(cycles.expulsions).toEqual([]);

    await runOn('2027-01-09');
    expect(cycles.expulsions).toHaveLength(10);
    // Con el cargo por mora de la mensual: el 3 % de la cuota impaga de cada uno. `overdue` es
    // otra cosa —la deuda acumulada de quien ya cobró su payout— y el cargo no se calcula sobre
    // ella, igual que antes de la épica.
    for (const { position, lateFee } of cycles.expulsions) {
      const installment = PRICING.quote(TERMS, position).installments[2]!;
      expect(lateFee).toEqual(installment.percentage(300));
    }
  });
});
