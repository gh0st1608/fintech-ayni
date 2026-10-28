export const CLOCK = Symbol('CLOCK');

/** Hora actual. Los casos de uso la reciben inyectada para que las pruebas controlen el tiempo. */
export interface ClockPort {
  now(): Date;
}
