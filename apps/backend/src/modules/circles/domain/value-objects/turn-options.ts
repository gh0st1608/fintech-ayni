import { DomainError } from '../../../../shared/errors/app-error';
import { MIN_CIRCLE_TURNS } from './circle-terms';

export class InvalidTurnOptionsError extends DomainError {
  constructor(message: string) {
    super('INVALID_TURN_OPTIONS', message);
  }
}

/** Tope del rango admitido. El máximo real por cadencia lo decide negocio (COPAYNI-101). */
export const MAX_CIRCLE_TURNS = 24;

/**
 * Qué números de turno se pueden elegir (COPAYNI-125).
 *
 * Admite las dos formas a propósito:
 *
 * - **Lista cerrada**, que es la configuración de hoy (`6,10,12` en dev y en prd) y la que debe
 *   seguir produciendo exactamente las mismas opciones mientras negocio no decida otra cosa.
 * - **Rango**, que es la capacidad nueva: el usuario elige cuántos turnos quiere dentro de un
 *   mínimo y un máximo. El mínimo es 2 —con uno no hay junta— y el máximo lo decide negocio
 *   (COPAYNI-101), así que hasta entonces conviven.
 *
 * El objeto solo dice qué números **se ofrecen a evaluar**. Cuáles de ellos son construibles para
 * un monto concreto lo decide la regla de cuota exacta (COPAYNI-113), que no depende de la
 * cadencia sino del número de turnos.
 */
const admissible = (turns: number): boolean =>
  Number.isInteger(turns) && turns >= MIN_CIRCLE_TURNS && turns <= MAX_CIRCLE_TURNS;

export class TurnOptions {
  private constructor(private readonly values: readonly number[]) {}

  /** La lista cerrada de hoy, tal como se configura: un valor inadmisible no arranca. */
  static list(values: readonly number[]): TurnOptions {
    if (values.length === 0) {
      throw new InvalidTurnOptionsError('Hace falta al menos una duración');
    }
    if (!values.every(admissible)) {
      throw new InvalidTurnOptionsError(
        `Las duraciones deben ser enteros entre ${MIN_CIRCLE_TURNS} y ${MAX_CIRCLE_TURNS}`,
      );
    }
    return TurnOptions.from(values);
  }

  /**
   * Las duraciones admisibles de una lista cualquiera, descartando el resto y admitiendo que no
   * quede ninguna. Es la vía para quien recibe una lista de números sin validar; la
   * configuración entra por `list`, que no perdona un valor inadmisible en silencio.
   */
  static from(values: readonly number[]): TurnOptions {
    return new TurnOptions([...new Set(values.filter(admissible))].sort((a, b) => a - b));
  }

  /** El rango configurable, ambos extremos incluidos. */
  static range(min: number, max: number): TurnOptions {
    if (!Number.isInteger(min) || !Number.isInteger(max)) {
      throw new InvalidTurnOptionsError('El rango de turnos debe ser de enteros');
    }
    if (min < MIN_CIRCLE_TURNS) {
      throw new InvalidTurnOptionsError(`El mínimo de turnos es ${MIN_CIRCLE_TURNS}`);
    }
    if (max > MAX_CIRCLE_TURNS) {
      throw new InvalidTurnOptionsError(`El máximo de turnos es ${MAX_CIRCLE_TURNS}`);
    }
    if (max < min) {
      throw new InvalidTurnOptionsError('El máximo de turnos no puede ser menor que el mínimo');
    }
    return new TurnOptions(Array.from({ length: max - min + 1 }, (_unused, index) => min + index));
  }

  /** Los números de turno a evaluar, de menor a mayor. */
  get candidates(): readonly number[] {
    return this.values;
  }
}
