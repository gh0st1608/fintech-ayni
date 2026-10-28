import { DomainError } from '../../errors/app-error';

const PERIOD_FORMAT = /^(\d{4})-(\d{2})$/;

export class InvalidPeriodError extends DomainError {
  constructor(message: string) {
    super('INVALID_PERIOD', message);
  }
}

/**
 * Mes calendario (año y mes), sin día ni zona horaria: las cuotas y los payouts de un
 * círculo son mensuales. Se serializa como `YYYY-MM`.
 */
export class Period {
  private constructor(
    readonly year: number,
    readonly month: number,
  ) {}

  static of(year: number, month: number): Period {
    if (!Number.isInteger(year) || year < 2000 || year > 9999) {
      throw new InvalidPeriodError('El año debe estar entre 2000 y 9999');
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new InvalidPeriodError('El mes debe estar entre 1 y 12');
    }
    return new Period(year, month);
  }

  static parse(value: string): Period {
    const match = PERIOD_FORMAT.exec(value);
    if (!match) throw new InvalidPeriodError('El periodo debe tener el formato YYYY-MM');
    return Period.of(Number(match[1]), Number(match[2]));
  }

  /** Mes calendario de `date` en la zona horaria IANA `timeZone` (p. ej. America/Lima). */
  static fromDate(date: Date, timeZone: string): Period {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
    }).formatToParts(date);
    const part = (type: 'year' | 'month'): number =>
      Number(parts.find((candidate) => candidate.type === type)?.value);
    return Period.of(part('year'), part('month'));
  }

  addMonths(months: number): Period {
    if (!Number.isInteger(months)) throw new InvalidPeriodError('Los meses deben ser enteros');
    const index = this.year * 12 + (this.month - 1) + months;
    return Period.of(Math.floor(index / 12), (index % 12) + 1);
  }

  /** Meses desde `this` hasta `other` (negativo si `other` es anterior). */
  monthsUntil(other: Period): number {
    return other.year * 12 + other.month - (this.year * 12 + this.month);
  }

  isAfter(other: Period): boolean {
    return this.monthsUntil(other) < 0;
  }

  equals(other: Period): boolean {
    return this.year === other.year && this.month === other.month;
  }

  toString(): string {
    return `${this.year}-${String(this.month).padStart(2, '0')}`;
  }
}
