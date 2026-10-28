import { QueryFailedError } from 'typeorm';

/** Códigos SQLSTATE de PostgreSQL que los repositorios traducen a errores de dominio. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

interface PostgresDriverError {
  code?: string;
  constraint?: string;
}

/** Restricción violada si el error es de PostgreSQL con ese código; si no, `undefined`. */
export function violatedConstraint(error: unknown, code: string): string | undefined {
  if (!(error instanceof QueryFailedError)) return undefined;
  const driverError = error.driverError as PostgresDriverError;
  return driverError.code === code ? (driverError.constraint ?? '') : undefined;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Los ids son uuid: otro valor nunca existe, y PostgreSQL rechazaría la consulta. */
export const isUuid = (value: string): boolean => UUID.test(value);
