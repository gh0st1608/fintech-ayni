import { randomUUID } from 'node:crypto';

import { DataSource, type EntitySchema } from 'typeorm';

import { validateEnvironment } from '@src/config/env.validation';
import { dataSourceOptions } from '@src/shared/infrastructure/persistence/typeorm-options';

import { TEST_ENV } from '../setup-env';

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type EntityTarget = Function | EntitySchema;

/**
 * Conexión a la base de pruebas, ya migrada por global-setup.ts. Cada archivo abre la suya y la
 * cierra en afterAll.
 */
export async function openTestDatabase(entities: EntityTarget[]): Promise<DataSource> {
  const dataSource = new DataSource({
    ...dataSourceOptions(validateEnvironment({ ...TEST_ENV })),
    entities,
  });
  return dataSource.initialize();
}

/** Inserta un usuario activo y devuelve su id (las membresías referencian usuarios reales). */
export async function insertTestUser(dataSource: DataSource): Promise<string> {
  const id = randomUUID();
  await dataSource.query(`INSERT INTO users (id, email, status) VALUES ($1, $2, 'active')`, [
    id,
    `${id}@test.ayni`,
  ]);
  return id;
}
