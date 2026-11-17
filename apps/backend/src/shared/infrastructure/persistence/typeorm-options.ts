import { readFileSync } from 'node:fs';

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
  | 'DB_SSL_CA_FILE'
  | 'DB_POOL_MAX'
  | 'APP_NAME'
>;

/** Tiempo máximo de una consulta: menor que REQUEST_TIMEOUT para que la petición falle limpia. */
const STATEMENT_TIMEOUT_MS = 10_000;

/**
 * CA con la que se verifica el certificado del servidor. El PEM literal gana al archivo; sin
 * ninguno de los dos, las CA del sistema, que no incluyen la raíz de Amazon RDS.
 */
function certificateAuthority(settings: DatabaseSettings): string | undefined {
  if (settings.DB_SSL_CA) return settings.DB_SSL_CA;
  if (!settings.DB_SSL_CA_FILE) return undefined;
  try {
    return readFileSync(settings.DB_SSL_CA_FILE, 'utf8');
  } catch {
    // Un fallo aquí deja la conexión sin CA y TLS la rechaza: mejor decir cuál es el archivo.
    throw new Error(`No se pudo leer DB_SSL_CA_FILE: ${settings.DB_SSL_CA_FILE}`);
  }
}

function sslOptions(settings: DatabaseSettings): { rejectUnauthorized: true; ca?: string } {
  const ca = certificateAuthority(settings);
  // Siempre se verifica el certificado: RDS exige TLS (rds.force_ssl) y aceptarlo sin verificar
  // deja la conexión abierta a un intermediario dentro de la VPC.
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

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
    ssl: settings.DB_SSL ? sslOptions(settings) : false,
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
