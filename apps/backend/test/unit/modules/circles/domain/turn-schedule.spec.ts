import { TurnSchedule } from '@src/modules/circles/domain/services/turn-schedule';
import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Period } from '@src/shared/domain/value-objects/period';

const day = (value: string) => LocalDate.parse(value);

describe('TurnSchedule', () => {
  it('reproduce turno por turno el cronograma mensual que derivaba de startsOn + (posición - 1)', () => {
    const startsOn = day('2027-01-01');
    const schedule = new TurnSchedule(startsOn, Cadence.monthly, 10);

    for (let turn = 1; turn <= 10; turn += 1) {
      // Lo que calculaba CircleTerms.payoutPeriodOf antes de COPAYNI-100.
      const expected = startsOn.period.addMonths(turn - 1);
      expect(schedule.dueOn(turn).period.toString()).toBe(expected.toString());
      expect(schedule.payoutOn(turn).toString()).toBe(schedule.dueOn(turn).toString());
    }
    expect(schedule.endsOn().period.toString()).toBe(Period.of(2027, 10).toString());
  });

  it('una junta semanal de 10 turnos termina 63 días después del primero', () => {
    const schedule = new TurnSchedule(day('2027-03-04'), Cadence.weekly, 10);
    expect(schedule.dueOn(1).toString()).toBe('2027-03-04');
    expect(schedule.dueOn(10).toString()).toBe('2027-05-06');
    expect(schedule.dueOn(1).daysUntil(schedule.dueOn(10))).toBe(63);
  });

  it('una junta quincenal de 10 turnos termina 126 días después del primero', () => {
    const schedule = new TurnSchedule(day('2027-03-04'), Cadence.biweekly, 10);
    expect(schedule.dueOn(1).daysUntil(schedule.dueOn(10))).toBe(126);
  });

  it('da cuatro turnos distintos dentro del mismo mes en cadencia semanal', () => {
    const schedule = new TurnSchedule(day('2027-03-04'), Cadence.weekly, 4);
    const sameMonth = schedule.all().filter((turn) => turn.dueOn.period.toString() === '2027-03');
    expect(sameMonth).toHaveLength(4);
    // El mes ya no identifica un turno; las etiquetas tienen que seguir siendo distintas.
    const labels = new Set(sameMonth.map((turn) => schedule.labelOf(turn.turn)));
    expect(labels.size).toBe(4);
  });

  it('no nombra el mes salvo en cadencia mensual', () => {
    const weekly = new TurnSchedule(day('2027-03-04'), Cadence.weekly, 3);
    const biweekly = new TurnSchedule(day('2027-03-04'), Cadence.biweekly, 3);
    const monthly = new TurnSchedule(day('2027-03-01'), Cadence.monthly, 3);

    expect(weekly.labelOf(3)).toBe('Semana 3 · 2027-03-18');
    expect(biweekly.labelOf(3)).toBe('Quincena 3 · 2027-04-01');
    expect(monthly.labelOf(3)).toBe('Mes 3 · 2027-05-01');

    expect(weekly.labelOf(1).toLowerCase()).not.toContain('mes');
    expect(biweekly.labelOf(1).toLowerCase()).not.toContain('mes');
    expect(monthly.labelOf(1).toLowerCase()).toContain('mes');
  });

  it('devuelve el turno vigente en una fecha, y null fuera de la vida de la junta', () => {
    const schedule = new TurnSchedule(day('2027-03-04'), Cadence.weekly, 3);

    expect(schedule.turnAt(day('2027-03-04'))).toBe(1);
    expect(schedule.turnAt(day('2027-03-07'))).toBe(1);
    expect(schedule.turnAt(day('2027-03-11'))).toBe(2);
    expect(schedule.turnAt(day('2027-03-18'))).toBe(3);
    // El último turno sigue vigente hasta que habría vencido el siguiente.
    expect(schedule.turnAt(day('2027-03-24'))).toBe(3);

    expect(schedule.turnAt(day('2027-03-03'))).toBeNull();
    expect(schedule.turnAt(day('2027-03-25'))).toBeNull();
  });

  it('entrega el cronograma completo en orden y sin huecos', () => {
    const schedule = new TurnSchedule(day('2027-03-04'), Cadence.biweekly, 6);
    const all = schedule.all();

    expect(all).toHaveLength(6);
    expect(all.map((turn) => turn.turn)).toEqual([1, 2, 3, 4, 5, 6]);
    all.forEach((turn) => {
      expect(turn.dueOn.toString()).toBe(schedule.dueOn(turn.turn).toString());
    });
    expect(all[5]!.dueOn.toString()).toBe(schedule.endsOn().toString());
  });

  it('rechaza un turno fuera de rango y un número de turnos imposible', () => {
    const schedule = new TurnSchedule(day('2027-03-04'), Cadence.weekly, 3);

    expect(() => schedule.dueOn(0)).toThrow(expect.objectContaining({ code: 'INVALID_TURN' }));
    expect(() => schedule.dueOn(4)).toThrow(expect.objectContaining({ code: 'INVALID_TURN' }));
    expect(() => schedule.dueOn(1.5)).toThrow(expect.objectContaining({ code: 'INVALID_TURN' }));
    expect(() => new TurnSchedule(day('2027-03-04'), Cadence.weekly, 0)).toThrow(
      expect.objectContaining({ code: 'INVALID_TURN' }),
    );
  });

  it('arranca cualquier día en cadencia semanal, que es lo que el modelo mensual impedía', () => {
    const schedule = new TurnSchedule(day('2027-03-12'), Cadence.weekly, 4);
    expect(schedule.dueOn(1).day).toBe(12);
    expect(schedule.all().map((turn) => turn.dueOn.toString())).toEqual([
      '2027-03-12',
      '2027-03-19',
      '2027-03-26',
      '2027-04-02',
    ]);
  });
});
