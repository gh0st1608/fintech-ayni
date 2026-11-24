import { DomainError } from '../../../../shared/errors/app-error';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';

export class InvalidCadenceError extends DomainError {
  constructor(message: string) {
    super('INVALID_CADENCE', message);
  }
}

/** Identificadores admitidos. `monthly` es el único que existía antes de COPAYNI-100. */
export const CADENCE_IDS = ['monthly', 'biweekly', 'weekly'] as const;

export type CadenceId = (typeof CADENCE_IDS)[number];

/**
 * Cada cuánto le toca un turno a una junta.
 *
 * No es una enumeración que el dominio inspeccione con `switch`, sino una **regla de avance de
 * calendario**: dado un día y un número de pasos, devuelve el día resultante. Hay dos formas de
 * avanzar, y por eso hay dos implementaciones:
 *
 * - **Paso calendario** (`monthly`): suma meses, de modo que el turno cae siempre en la misma
 *   fecha del mes. Es el comportamiento que el producto ya tenía.
 * - **Paso por días** (`biweekly`, `weekly`): suma días corridos, de modo que el turno cae
 *   siempre en el mismo día de la semana.
 *
 * Modelarlo así tiene una consecuencia deliberada: una cadencia futura (bimensual, diaria) se
 * añade a `CADENCE_IDS` y a la tabla de abajo, sin tocar a quien la usa.
 */
export class Cadence {
  private constructor(
    readonly id: CadenceId,
    /** Días que avanza un paso, o `null` cuando el paso es calendario. */
    private readonly stepDays: number | null,
    private readonly stepMonths: number | null,
    private readonly turnName: string,
  ) {}

  static readonly monthly = new Cadence('monthly', null, 1, 'Mes');
  static readonly biweekly = new Cadence('biweekly', 14, null, 'Quincena');
  static readonly weekly = new Cadence('weekly', 7, null, 'Semana');

  /** La cadencia de los círculos que existían antes de admitir varias. */
  static readonly default = Cadence.monthly;

  static all(): readonly Cadence[] {
    return [Cadence.monthly, Cadence.biweekly, Cadence.weekly];
  }

  /**
   * Falla con un error de dominio ante un identificador desconocido. No cae en un valor por
   * defecto silencioso: confundir una cadencia por otra cambia cuánto y cuándo paga la gente.
   */
  static parse(value: string): Cadence {
    const found = Cadence.all().find((candidate) => candidate.id === value);
    if (!found) {
      throw new InvalidCadenceError(
        `Cadencia desconocida: ${value}. Admitidas: ${CADENCE_IDS.join(', ')}`,
      );
    }
    return found;
  }

  /**
   * El día `steps` pasos después de `from` (antes, si `steps` es negativo).
   *
   * En paso calendario, un día que no existe en el mes destino se ajusta al último día de ese
   * mes: el 31 de enero más un paso es el 28 o 29 de febrero. Así el vencimiento de una cuota
   * nunca es una fecha inexistente, que es lo que ocurriría al sumar días sin más.
   */
  advance(from: LocalDate, steps: number): LocalDate {
    if (!Number.isInteger(steps)) {
      throw new InvalidCadenceError('Los pasos de cadencia deben ser un entero');
    }
    if (this.stepDays !== null) return from.addDays(this.stepDays * steps);

    const target = from.period.addMonths(this.stepMonths! * steps);
    return LocalDate.of(target, Math.min(from.day, LocalDate.lastDayOf(target)));
  }

  /**
   * Pasos enteros de esta cadencia que separan `from` de `to`, negativos si `to` es anterior.
   *
   * Es lo que necesita quien corre el cronograma por haber estado detenido (la pausa del ciclo,
   * COPAYNI-61). Cuenta en la unidad de la cadencia, y no en días para todas, porque un paso
   * calendario no mide días: de noviembre a diciembre hay un paso aunque medien cuatro días, y
   * así se contaba la pausa cuando la única cadencia era la mensual.
   */
  stepsBetween(from: LocalDate, to: LocalDate): number {
    if (this.stepDays !== null) return Math.trunc(from.daysUntil(to) / this.stepDays);
    return Math.trunc(from.period.monthsUntil(to.period) / this.stepMonths!);
  }

  /** Cuántos turnos abarca un año, para dimensionar riesgo y carga operativa. */
  turnsPerYear(): number {
    return this.stepDays !== null ? Math.floor(365 / this.stepDays) : 12 / this.stepMonths!;
  }

  /** Cuántos días dura un turno, aproximado en paso calendario. Para validar días de gracia. */
  approximateTurnDays(): number {
    return this.stepDays ?? Math.round(this.stepMonths! * 30.44);
  }

  /** Cómo se nombra un turno de esta cadencia: «Semana», «Quincena», «Mes». */
  turnLabel(): string {
    return this.turnName;
  }

  isMonthly(): boolean {
    return this.id === 'monthly';
  }

  equals(other: Cadence): boolean {
    return this.id === other.id;
  }

  toString(): string {
    return this.id;
  }
}
