import { LocalDate } from '@src/shared/domain/value-objects/local-date';
import { Period } from '@src/shared/domain/value-objects/period';

describe('LocalDate', () => {
  it('se serializa como YYYY-MM-DD y se compara por fecha', () => {
    const date = LocalDate.of(Period.of(2026, 11), 5);
    expect(date.toString()).toBe('2026-11-05');
    expect(LocalDate.parse('2026-11-05').equals(date)).toBe(true);
    expect(LocalDate.parse('2026-11-06').isAfter(date)).toBe(true);
    expect(LocalDate.parse('2026-10-30').isAfter(date)).toBe(false);
  });

  it('toma el día de la zona horaria del negocio', () => {
    // 1 de noviembre a las 03:00 UTC sigue siendo 31 de octubre en Lima (UTC-5).
    const instant = new Date('2026-11-01T03:00:00Z');
    expect(LocalDate.fromDate(instant, 'America/Lima').toString()).toBe('2026-10-31');
    expect(LocalDate.fromDate(instant, 'UTC').toString()).toBe('2026-11-01');
  });

  it('suma días corridos cruzando meses, años y febrero bisiesto', () => {
    const day = (value: string) => LocalDate.parse(value);
    expect(day('2026-11-05').addDays(3).toString()).toBe('2026-11-08');
    expect(day('2026-12-30').addDays(3).toString()).toBe('2027-01-02');
    expect(day('2028-02-28').addDays(1).toString()).toBe('2028-02-29');
    expect(day('2026-03-01').addDays(-1).toString()).toBe('2026-02-28');
    expect(day('2026-11-05').addDays(0)).toEqual(day('2026-11-05'));
    expect(() => day('2026-11-05').addDays(1.5)).toThrow(
      expect.objectContaining({ code: 'INVALID_LOCAL_DATE' }),
    );
  });

  it('rechaza días que no existen en el mes y formatos inválidos', () => {
    expect(LocalDate.of(Period.of(2028, 2), 29).toString()).toBe('2028-02-29');
    for (const invalid of [
      () => LocalDate.of(Period.of(2027, 2), 29),
      () => LocalDate.of(Period.of(2026, 11), 0),
      () => LocalDate.of(Period.of(2026, 11), 1.5),
      () => LocalDate.parse('2026-11'),
      () => LocalDate.parse('2026-13-01'),
    ]) {
      expect(invalid).toThrow(
        expect.objectContaining({ code: expect.stringMatching(/INVALID_(LOCAL_DATE|PERIOD)/) }),
      );
    }
  });
});
