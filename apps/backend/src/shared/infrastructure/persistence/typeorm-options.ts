import { type DataSourceOptions } from 'typeorm';

import { type EnvironmentVariables } from '../../../config/env.validation';
import { MIGRATIONS } from './migrations';

export type DatabaseSettings = Pick<
  EnvironmentVariables,
  | 'DB_HOST'
  | 'DB_PORT'
  | 'DB_NAME'
  | 'DB_USERNAME'
  | 'DB_PASSWORD'
  | 'DB_SSL'
  | 'DB_SSL_CA'
  | 'DB_POOL_MAX'
  | 'APP_NAME'
>;

/** Tiempo máximo de una consulta: menor que REQUEST_TIMEOUT para que la petición falle limpia. */
const STATEMENT_TIMEOUT_MS = 10_000;

/**
 * Opciones comunes de la API y del runner de migraciones (migrate.ts). El esquema solo cambia
 * con migraciones: nunca `synchronize`.
 */
export function dataSourceOptions(settings: DatabaseSettings): DataSourceOptions {
  return {
    type: 'postgres',
    host: settings.DB_HOST,
    port: settings.DB_PORT,
    database: settings.DB_NAME,
    username: settings.DB_USERNAME,
    password: settings.DB_PASSWORD,
    ssl: settings.DB_SSL
      ? { rejectUnauthorized: true, ...(settings.DB_SSL_CA ? { ca: settings.DB_SSL_CA } : {}) }
      : false,
    applicationName: settings.APP_NAME,
    synchronize: false,
    migrationsRun: false,
    migrations: MIGRATIONS,
    migrationsTableName: 'schema_migrations',
    // Las consultas no se registran: pueden llevar datos personales.
    logging: false,
    extra: {
      max: settings.DB_POOL_MAX,
      statement_timeout: STATEMENT_TIMEOUT_MS,
      connectionTimeoutMillis: 5_000,
    },
  };
}
