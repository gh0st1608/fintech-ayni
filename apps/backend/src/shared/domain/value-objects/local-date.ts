import { DomainError } from '../../errors/app-error';
import { Period } from './period';

const LOCAL_DATE_FORMAT = /^(\d{4}-\d{2})-(\d{2})$/;

export class InvalidLocalDateError extends DomainError {
  constructor(message: string) {
    super('INVALID_LOCAL_DATE', message);
  }
}

/** Días que tiene el mes de `period`. */
const daysIn = (period: Period): number =>
  new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();

/**
 * Día calendario sin hora ni zona horaria, como el vencimiento de una cuota. Se serializa como
 * `YYYY-MM-DD`, que también ordena bien como texto.
 */
export class LocalDate {
  private constructor(
    readonly period: Period,
    readonly day: number,
  ) {}

  static of(period: Period, day: number): LocalDate {
    if (!Number.isInteger(day) || day < 1 || day > daysIn(period)) {
      throw new InvalidLocalDateError(`El día debe estar entre 1 y ${daysIn(period)}`);
    }
    return new LocalDate(period, day);
  }

  static parse(value: string): LocalDate {
    const match = LOCAL_DATE_FORMAT.exec(value);
    if (!match) throw new InvalidLocalDateError('La fecha debe tener el formato YYYY-MM-DD');
    return LocalDate.of(Period.parse(match[1]!), Number(match[2]));
  }

  /** Día calendario de `date` en la zona horaria IANA `timeZone` (p. ej. America/Lima). */
  static fromDate(date: Date, timeZone: string): LocalDate {
    const day = new Intl.DateTimeFormat('en-US', { timeZone, day: 'numeric' }).format(date);
    return LocalDate.of(Period.fromDate(date, timeZone), Number(day));
  }

  /** El día `days` días corridos después (o antes, si es negativo), cruzando meses y años. */
  addDays(days: number): LocalDate {
    if (!Number.isInteger(days)) throw new InvalidLocalDateError('Los días deben ser un entero');
    const date = new Date(Date.UTC(this.period.year, this.period.month - 1, this.day + days));
    return LocalDate.parse(date.toISOString().slice(0, 10));
  }

  isAfter(other: LocalDate): boolean {
    return this.toString() > other.toString();
  }

  equals(other: LocalDate): boolean {
    return this.toString() === other.toString();
  }

  toString(): string {
    return `${this.period.toString()}-${String(this.day).padStart(2, '0')}`;
  }
}
