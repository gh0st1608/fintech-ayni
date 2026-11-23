import { Cadence } from '@src/modules/circles/domain/value-objects/cadence';
import { LocalDate } from '@src/shared/domain/value-objects/local-date';

const day = (value: string) => LocalDate.parse(value);

describe('Cadence', () => {
  it('avanza meses calendario en cadencia mensual', () => {
    expect(Cadence.monthly.advance(day('2027-01-01'), 0).toString()).toBe('2027-01-01');
    expect(Cadence.monthly.advance(day('2027-01-01'), 1).toString()).toBe('2027-02-01');
    expect(Cadence.monthly.advance(day('2027-01-15'), 3).toString()).toBe('2027-04-15');
    expect(Cadence.monthly.advance(day('2027-01-15'), -1).toString()).toBe('2026-12-15');
  });

  it('avanza 7 y 14 días corridos en semanal y quincenal', () => {
    expect(Cadence.weekly.advance(day('2027-03-04'), 1).toString()).toBe('2027-03-11');
    expect(Cadence.weekly.advance(day('2027-03-04'), 9).toString()).toBe('2027-05-06');
    expect(Cadence.biweekly.advance(day('2027-03-04'), 1).toString()).toBe('2027-03-18');
    expect(Cadence.biweekly.advance(day('2027-03-04'), 9).toString()).toBe('2027-07-08');
  });

  it('coincide exactamente con Period.addMonths para 0..36 pasos, que es el comportamiento previo', () => {
    const start = day('2027-01-01');
    for (let steps = 0; steps <= 36; steps += 1) {
      const expected = start.period.addMonths(steps);
      const advanced = Cadence.monthly.advance(start, steps);
      expect(advanced.period.toString()).toBe(expected.toString());
      expect(advanced.day).toBe(1);
    }
  });

  it('ajusta al último día del mes cuando el día no existe en el destino', () => {
    // 31 de enero más un paso no puede ser el 31 de febrero.
    expect(Cadence.monthly.advance(day('2027-01-31'), 1).toString()).toBe('2027-02-28');
    expect(Cadence.monthly.advance(day('2028-01-31'), 1).toString()).toBe('2028-02-29');
    expect(Cadence.monthly.advance(day('2027-01-31'), 3).toString()).toBe('2027-04-30');
    // Y no arrastra el ajuste: marzo vuelve a tener 31.
    expect(Cadence.monthly.advance(day('2027-01-31'), 2).toString()).toBe('2027-03-31');
  });

  it('conserva el día de la semana al avanzar en semanal y quincenal', () => {
    const weekdayOf = (date: LocalDate) =>
      new Date(Date.UTC(date.period.year, date.period.month - 1, date.day)).getUTCDay();
    const start = day('2027-03-04');
    for (let steps = 0; steps <= 52; steps += 1) {
      expect(weekdayOf(Cadence.weekly.advance(start, steps))).toBe(weekdayOf(start));
      expect(weekdayOf(Cadence.biweekly.advance(start, steps))).toBe(weekdayOf(start));
    }
  });

  it('cruza el cambio de horario de Lima sin desplazar el día', () => {
    // Perú no aplica horario de verano, pero la aritmética debe ser de calendario y no de horas,
    // así que un avance semanal sobre el inicio de abril no puede perder ni ganar un día.
    expect(Cadence.weekly.advance(day('2027-03-28'), 1).toString()).toBe('2027-04-04');
    expect(Cadence.weekly.advance(day('2027-10-31'), 1).toString()).toBe('2027-11-07');
  });

  it('rechaza un identificador desconocido en lugar de caer en un valor por defecto', () => {
    expect(Cadence.parse('monthly').equals(Cadence.monthly)).toBe(true);
    expect(Cadence.parse('weekly').equals(Cadence.weekly)).toBe(true);
    expect(Cadence.parse('biweekly').equals(Cadence.biweekly)).toBe(true);
    expect(() => Cadence.parse('quarterly')).toThrow(
      expect.objectContaining({ code: 'INVALID_CADENCE' }),
    );
    expect(() => Cadence.parse('')).toThrow(expect.objectContaining({ code: 'INVALID_CADENCE' }));
  });

  it('rechaza pasos no enteros', () => {
    expect(() => Cadence.monthly.advance(day('2027-01-01'), 1.5)).toThrow(
      expect.objectContaining({ code: 'INVALID_CADENCE' }),
    );
    expect(() => Cadence.weekly.advance(day('2027-01-01'), Number.NaN)).toThrow(
      expect.objectContaining({ code: 'INVALID_CADENCE' }),
    );
  });

  it('expone la frecuencia anual y la duración del turno, que es lo que dimensiona el riesgo', () => {
    expect(Cadence.monthly.turnsPerYear()).toBe(12);
    expect(Cadence.biweekly.turnsPerYear()).toBe(26);
    expect(Cadence.weekly.turnsPerYear()).toBe(52);
    expect(Cadence.weekly.approximateTurnDays()).toBe(7);
    expect(Cadence.biweekly.approximateTurnDays()).toBe(14);
    expect(Cadence.monthly.approximateTurnDays()).toBe(30);
  });

  it('la cadencia por defecto es la mensual, para no cambiar los círculos existentes', () => {
    expect(Cadence.default.equals(Cadence.monthly)).toBe(true);
    expect(Cadence.default.isMonthly()).toBe(true);
    expect(Cadence.weekly.isMonthly()).toBe(false);
    expect(Cadence.monthly.toString()).toBe('monthly');
  });
});
