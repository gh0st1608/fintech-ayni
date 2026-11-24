import {
  CircleCycle,
  type CycleMember,
  type Installment,
} from '@src/modules/circles/domain/entities/circle-cycle';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { CircleTerms } from '@src/modules/circles/domain/value-objects/circle-terms';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';
import {
  TEST_DELINQUENCY,
  TEST_FUND_SHARE_BPS,
  TEST_PRICING,
} from '@test/support/join-circle.fixture';

/**
 * El motor de ciclo en las tres cadencias (COPAYNI-126).
 *
 * El defecto que cubre esta prueba perdía dinero: una junta semanal de 4 turnos se declaraba
 * terminada al cerrar el primero, habiendo pagado el pozo a un solo miembro, porque el fin del
 * círculo se decidía comparando el mes en curso con el mes de fin y los cuatro turnos caen en el
 * mismo mes. Los otros tres pagaban su cuota y no cobraban nunca.
 */
const day = (value: string) => LocalDate.parse(value);

/**
 * 12.000 en 4 turnos semanales desde el miércoles 4 de noviembre: cuota base de 3.000.
 *
 * Los cuatro turnos caen dentro de noviembre, que es el escenario con el que se midió el defecto:
 * su mes de fin es noviembre y el primer cierre ya lo alcanzaba.
 */
const WEEKLY = CircleTerms.create({
  payout: Money.of(1_200_000, 'PEN'),
  turns: 4,
  cadence: Cadence.weekly,
  startsOn: day('2026-11-04'),
});

/** 12.000 en 6 turnos quincenales desde el jueves 12 de noviembre: cuota base de 2.000. */
const BIWEEKLY = CircleTerms.create({
  payout: Money.of(1_200_000, 'PEN'),
  turns: 6,
  cadence: Cadence.biweekly,
  startsOn: day('2026-11-12'),
});

/** 3.000 en 3 meses desde noviembre de 2026, el círculo de las pruebas que ya existían. */
const MONTHLY = CircleTerms.create({
  payout: Money.of(300_000, 'PEN'),
  months: 3,
  startsOn: Period.of(2026, 11),
});

let ids = 0;
const newId = () => `i-${++ids}`;

const members = (terms: CircleTerms): CycleMember[] =>
  Array.from({ length: terms.turns }, (_unused, index) => ({
    userId: `u-${index + 1}`,
    position: index + 1,
    quote: TEST_PRICING.quote(terms, index + 1),
  }));

/** Un ciclo listo para empezar, con todos sus turnos ocupados. El día de cobro es el 5. */
function cycle(
  terms: CircleTerms,
  state: {
    state?: 'collecting' | 'contributing';
    currentPeriod?: Period | null;
    currentTurn?: number | null;
    installments?: readonly Installment[];
  } = {},
) {
  return CircleCycle.restore({
    circleId: 'c-1',
    terms,
    dueDay: 5,
    delinquency: TEST_DELINQUENCY,
    fund: { balance: Money.of(10_000_000, 'PEN'), feeShareBps: TEST_FUND_SHARE_BPS },
    state: state.state ?? 'collecting',
    currentPeriod: state.currentPeriod ?? null,
    currentTurn: state.currentTurn,
    members: members(terms),
    installments: state.installments ?? [],
  });
}

/** Cobra y cierra el turno en curso el día en que vence. Devuelve lo que se pagó, si se pagó. */
function closeCurrentTurn(subject: CircleCycle) {
  const today = subject.installments.find(({ turn }) => turn === subject.currentTurn)!.dueOn;
  for (const { id } of subject.dueInstallments(today)) subject.recordCollection(id, 'paid');
  return subject.closePeriod(today, newId);
}

describe('El motor de ciclo recorre los turnos, no los meses (COPAYNI-126)', () => {
  it('una junta semanal de 4 turnos paga a sus cuatro miembros y termina en el cuarto', () => {
    const subject = cycle(WEEKLY);
    // Arranca el día real de su cronograma, no el día 1 del mes (COPAYNI-106).
    expect(subject.isStartDue(day('2026-11-03'))).toBe(false);
    expect(subject.isStartDue(day('2026-11-04'))).toBe(true);

    subject.start(newId);
    const paid: { turn: number; position: number; period: string }[] = [];
    for (let turn = 1; turn <= 4; turn += 1) {
      expect(subject.currentTurn).toBe(turn);
      const disbursement = closeCurrentTurn(subject);
      paid.push({
        turn: disbursement!.turn,
        position: disbursement!.position,
        period: disbursement!.period.toString(),
      });
    }

    // Cobran los cuatro, cada uno en su turno. Antes cobraba el primero y el círculo terminaba.
    expect(paid).toEqual([
      { turn: 1, position: 1, period: '2026-11' },
      { turn: 2, position: 2, period: '2026-11' },
      { turn: 3, position: 3, period: '2026-11' },
      { turn: 4, position: 4, period: '2026-11' },
    ]);
    // Los cuatro turnos en el mismo mes: el mes de fin se alcanzaba en el primer cierre.
    expect(subject.terms.endsOn).toEqual(Period.of(2026, 11));
    expect(subject.state).toBe('finished');
    expect(subject.currentTurn).toBeNull();
    expect(subject.currentPeriod).toBeNull();
  });

  it('las cuotas de una junta semanal vencen en cuatro fechas distintas, no el día del mes', () => {
    const subject = cycle(WEEKLY);
    subject.start(newId);
    const dueDates: string[] = [];
    for (let turn = 1; turn <= 4; turn += 1) {
      dueDates.push(subject.installments.find(({ turn: of }) => of === turn)!.dueOn.toString());
      closeCurrentTurn(subject);
    }

    // Miércoles tras miércoles desde el arranque. El día 5 del mes, que rige en cadencia mensual
    // (pending-scope R19), no corresponde a ningún turno semanal.
    expect(dueDates).toEqual(['2026-11-04', '2026-11-11', '2026-11-18', '2026-11-25']);
    expect(new Set(dueDates).size).toBe(4);
  });

  it('cada turno semanal se liquida con su propia clave: dos turnos del mes no se pisan', () => {
    const subject = cycle(WEEKLY);
    subject.start(newId);
    for (let turn = 1; turn <= 4; turn += 1) closeCurrentTurn(subject);

    // La clave es lo que impide que el libro mayor registre dos veces un cierre. Con el mes como
    // única seña, los turnos 1 a 3 compartían clave y solo el primero quedaba asentado: tres
    // miembros aportaban y su pozo no se movía.
    const payouts = subject.ledger.filter(({ kind }) => kind === 'payout');
    expect(payouts).toHaveLength(4);
    expect(new Set(payouts.map(({ key }) => key)).size).toBe(4);
    const keys = subject.ledger.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('una junta quincenal de 6 turnos los recorre todos, sin saltarse ni repetir ninguno', () => {
    const subject = cycle(BIWEEKLY);
    subject.start(newId);
    const schedule: { turn: number; dueOn: string; period: string }[] = [];
    for (let turn = 1; turn <= 6; turn += 1) {
      const installment = subject.installments.find(({ turn: of }) => of === turn)!;
      schedule.push({
        turn,
        dueOn: installment.dueOn.toString(),
        period: installment.period.toString(),
      });
      closeCurrentTurn(subject);
    }

    expect(schedule).toEqual([
      { turn: 1, dueOn: '2026-11-12', period: '2026-11' },
      { turn: 2, dueOn: '2026-11-26', period: '2026-11' },
      { turn: 3, dueOn: '2026-12-10', period: '2026-12' },
      { turn: 4, dueOn: '2026-12-24', period: '2026-12' },
      { turn: 5, dueOn: '2027-01-07', period: '2027-01' },
      { turn: 6, dueOn: '2027-01-21', period: '2027-01' },
    ]);
    // Dos turnos por mes: el mes no identifica un turno, y por eso el turno es quien manda.
    expect(new Set(schedule.map(({ period }) => period)).size).toBe(3);
    expect(subject.state).toBe('finished');
    expect(subject.disbursements.map(({ turn, position }) => [turn, position])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [5, 5],
      [6, 6],
    ]);
  });

  it('una junta mensual guardada sin turno se restaura idéntica, derivándolo del mes', () => {
    // Es el estado de cualquier círculo guardado antes de la expansión (COPAYNI-107): tiene mes
    // en curso y no tiene turno.
    const sinTurno = cycle(MONTHLY, { state: 'contributing', currentPeriod: Period.of(2026, 12) });
    const conTurno = cycle(MONTHLY, {
      state: 'contributing',
      currentPeriod: Period.of(2026, 12),
      currentTurn: 2,
    });

    for (const subject of [sinTurno, conTurno]) {
      expect(subject.currentTurn).toBe(2);
      expect(subject.currentPeriod).toEqual(Period.of(2026, 12));
      expect(subject.receiver()?.userId).toBe('u-2');
      expect(subject.terms.endsOn).toEqual(Period.of(2027, 1));
    }

    // Y sigue cobrando el día 5 del mes, que es lo que rige hoy.
    sinTurno.admitReplacements(newId);
    expect(sinTurno.installments.map(({ turn, dueOn }) => [turn, dueOn.toString()])).toEqual([
      [2, '2026-12-05'],
      [2, '2026-12-05'],
      [2, '2026-12-05'],
    ]);
  });

  it('un turno en curso fuera del círculo no se restaura en silencio', () => {
    expect(() =>
      cycle(MONTHLY, { state: 'contributing', currentPeriod: Period.of(2027, 6) }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_CYCLE_TRANSITION' }));
  });

  it('la pausa de una junta semanal corre el cronograma en semanas, no en meses', () => {
    const subject = cycle(WEEKLY);
    subject.start(newId);
    subject.pause(day('2026-11-05'), { actorId: 'staff-1', reason: 'Revisión' });
    // Ocho días de pausa: un paso semanal completo.
    expect(subject.resume(day('2026-11-13'), { actorId: 'staff-1', reason: 'Resuelto' })).toBe(
      true,
    );

    // Corrido una semana: el arranque pasa al miércoles siguiente y el cierre, tres más allá.
    // Contado en meses, como se contaba antes, la pausa de ocho días habría corrido el
    // cronograma un mes entero.
    expect(subject.terms.startsOn.toString()).toBe('2026-11-11');
    expect(subject.currentTurn).toBe(1);
    expect(subject.installments.map(({ turn, dueOn }) => [turn, dueOn.toString()])).toEqual([
      [1, '2026-11-13'],
      [1, '2026-11-13'],
      [1, '2026-11-13'],
      [1, '2026-11-13'],
    ]);
    // La pausa no cambió de mes, así que no hay nada que mover de mes.
    expect(subject.calendarShift).toBe(0);
    expect(subject.terms.endsOn).toEqual(Period.of(2026, 12));
  });

  it('la junta semanal reanudada sigue en su turno y termina en el cuarto', () => {
    const subject = cycle(WEEKLY);
    subject.start(newId);
    subject.pause(day('2026-11-05'), { actorId: 'staff-1', reason: 'Revisión' });
    subject.resume(day('2026-11-13'), { actorId: 'staff-1', reason: 'Resuelto' });
    for (let turn = 1; turn <= 4; turn += 1) {
      expect(subject.currentTurn).toBe(turn);
      closeCurrentTurn(subject);
    }

    expect(subject.state).toBe('finished');
    expect(subject.disbursements).toHaveLength(4);
  });
});
