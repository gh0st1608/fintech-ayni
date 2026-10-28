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
