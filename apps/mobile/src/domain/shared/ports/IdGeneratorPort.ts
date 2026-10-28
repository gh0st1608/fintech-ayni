/** Identificadores aleatorios e impredecibles (p. ej. claves de idempotencia). */
export interface IdGeneratorPort {
  next(): string;
}
