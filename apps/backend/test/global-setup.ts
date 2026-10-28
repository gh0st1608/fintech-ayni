import 'reflect-metadata';

import { DataSource } from 'typeorm';

import { validateEnvironment } from '../src/config/env.validation';
import { dataSourceOptions } from '../src/shared/infrastructure/persistence/typeorm-options';

import { TEST_ENV } from './setup-env';

/**
 * Una vez por corrida: deja la base de pruebas vacía y aplica todas las migraciones desde cero,
 * así cada corrida prueba también las migraciones. Las pruebas usan ids aleatorios y no
 * comparten filas, de modo que los archivos pueden correr en paralelo sin limpiar entre ellos.
 */
export default async function globalSetup(): Promise<void> {
  const dataSource = new DataSource(dataSourceOptions(validateEnvironment({ ...TEST_ENV })));
  try {
    await dataSource.initialize();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `No hay PostgreSQL de pruebas en ${TEST_ENV.DB_HOST}:${TEST_ENV.DB_PORT} (${reason}). ` +
        'Levantarlo con `npm run db:up`.',
      { cause: error },
    );
  }
  try {
    await dataSource.query('DROP SCHEMA public CASCADE');
    await dataSource.query('CREATE SCHEMA public');
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    await dataSource.destroy();
  }
}
