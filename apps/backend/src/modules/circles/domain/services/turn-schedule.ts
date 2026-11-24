import { DomainError } from '../../../../shared/errors/app-error';
import { LocalDate } from '../../../../shared/domain/value-objects/local-date';
import { type Cadence } from '../value-objects/cadence';

export class InvalidTurnError extends DomainError {
  constructor(message: string) {
    super('INVALID_TURN', message);
  }
}

/** Un turno del cronograma: su ordinal y el día en que vence. */
export interface Turn {
  readonly turn: number;
  readonly dueOn: LocalDate;
}

/**
 * El cronograma de una junta: qué turno vence qué día.
 *
 * Es el **único** sitio con aritmética de calendario de la junta. Antes de COPAYNI-100 estaba
 * repartida entre `CircleTerms.payoutPeriodOf`, la generación de cuotas y la tarea diaria del
 * ciclo; con una sola cadencia eso se sostenía, pero con tres cada cambio habría que replicarlo
 * en tres sitios y las discrepancias no darían la cara en pruebas, sino en fechas de cobro
 * equivocadas.
 *
 * El turno es un **ordinal** (1..N), no un mes. Esa es la diferencia que permite que una junta
 * semanal tenga cuatro turnos dentro del mismo mes calendario.
 */
export class TurnSchedule {
  constructor(
    /** Día en que vence el primer turno. */
    readonly startsOn: LocalDate,
    readonly cadence: Cadence,
    readonly turns: number,
  ) {
    if (!Number.isInteger(turns) || turns < 1) {
      throw new InvalidTurnError('Una junta tiene al menos un turno');
    }
  }

  /**
   * Cronograma de cobro de una junta en curso, que es el que usa el motor de ciclo.
   *
   * Se diferencia del cronograma a secas en una cosa: **en cadencia mensual la cuota vence el día
   * del mes que fija la política** (`dueDay`, pending-scope R19), no el día en que arrancó la
   * junta. Esa regla es la que rige hoy a todos los círculos y no se puede perder; fuera de la
   * cadencia mensual no significa nada, porque un turno semanal no tiene «día del mes», y
   * entonces el turno vence el día que le toca por calendario.
   *
   * Si el día de cobro del mes de arranque ya pasó cuando la junta empieza, el primer
   * vencimiento es el del mes siguiente: una cuota no nace vencida. Con los círculos que existen
   * hoy no ocurre, porque todos arrancan el día 1 y el día de cobro es posterior.
   */
  static forCollection(props: {
    startsOn: LocalDate;
    cadence: Cadence;
    turns: number;
    dueDay: number;
  }): TurnSchedule {
    const { startsOn, cadence, turns, dueDay } = props;
    if (!cadence.isMonthly()) return new TurnSchedule(startsOn, cadence, turns);
    // Un día que no existe en el mes se cobra el último: el 31 de cada mes es el 28 en febrero.
    const day = Math.min(dueDay, LocalDate.lastDayOf(startsOn.period));
    const first = LocalDate.of(startsOn.period, day);
    return new TurnSchedule(
      first.isBefore(startsOn) ? cadence.advance(first, 1) : first,
      cadence,
      turns,
    );
  }

  /** Día en que vence la cuota del turno `turn`. */
  dueOn(turn: number): LocalDate {
    this.assertInRange(turn);
    return this.cadence.advance(this.startsOn, turn - 1);
  }

  /**
   * Día en que se paga el pozo al miembro del turno `turn`.
   *
   * Coincide con el vencimiento de la cuota: el pozo se arma con lo recaudado en ese turno.
   * Existe como método propio porque es una decisión de negocio que puede cambiar, y conviene
   * que cambie en un solo sitio.
   */
  payoutOn(turn: number): LocalDate {
    return this.dueOn(turn);
  }

  /** Día en que vence el último turno. */
  endsOn(): LocalDate {
    return this.dueOn(this.turns);
  }

  /** El cronograma completo, en orden. */
  all(): Turn[] {
    return Array.from({ length: this.turns }, (_unused, index) => ({
      turn: index + 1,
      dueOn: this.dueOn(index + 1),
    }));
  }

  /**
   * Etiqueta con la que se identifica el turno ante la persona: «Semana 3 · 2027-03-15».
   *
   * Nombra la unidad de la cadencia, nunca «mes» salvo en cadencia mensual, porque en una junta
   * semanal hay cuatro turnos en el mismo mes y el mes deja de identificar nada. Devuelve la
   * fecha en formato ISO; darle formato según el idioma es cosa de la capa de presentación, que
   * es la que conoce el locale.
   */
  labelOf(turn: number): string {
    return `${this.cadence.turnLabel()} ${turn} · ${this.dueOn(turn).toString()}`;
  }

  /**
   * Turno vigente en `date`, o `null` si la fecha queda fuera de la vida de la junta.
   *
   * Vigente significa que `date` cae entre el vencimiento de ese turno y el del siguiente. Es lo
   * que necesita la tarea diaria del ciclo para decidir qué cobrar, y por eso devuelve `null` en
   * lugar de fallar: una fecha fuera de rango es una respuesta válida, no un error.
   */
  turnAt(date: LocalDate): number | null {
    if (date.isBefore(this.startsOn)) return null;
    const afterLast = this.cadence.advance(this.endsOn(), 1);
    if (!date.isBefore(afterLast)) return null;

    for (let turn = this.turns; turn >= 1; turn -= 1) {
      if (!date.isBefore(this.dueOn(turn))) return turn;
    }
    return null;
  }

  private assertInRange(turn: number): void {
    if (!Number.isInteger(turn) || turn < 1 || turn > this.turns) {
      throw new InvalidTurnError(`El turno debe estar entre 1 y ${this.turns}, y no ${turn}`);
    }
  }
}
