import { QueryFailedError } from 'typeorm';

import { validateEnvironment } from '@src/config/env.validation';
import {
  isUuid,
  PG_UNIQUE_VIOLATION,
  violatedConstraint,
} from '@src/shared/infrastructure/persistence/postgres-errors';
import { dataSourceOptions } from '@src/shared/infrastructure/persistence/typeorm-options';

import { TEST_ENV } from '../../../setup-env';

const options = (overrides: Record<string, string> = {}) =>
  dataSourceOptions(validateEnvironment({ ...TEST_ENV, ...overrides })) as unknown as Record<
    string,
    unknown
  >;

describe('dataSourceOptions', () => {
  it('nunca sincroniza el esquema ni registra consultas', () => {
    expect(options()).toMatchObject({
      type: 'postgres',
      synchronize: false,
      migrationsRun: false,
      logging: false,
      ssl: false,
      migrationsTableName: 'schema_migrations',
      extra: expect.objectContaining({ max: 5 }),
    });
  });

  it('con DB_SSL verifica el certificado, con la CA indicada si la hay', () => {
    expect(options({ DB_SSL: 'true' }).ssl).toEqual({ rejectUnauthorized: true });
    expect(options({ DB_SSL: 'true', DB_SSL_CA: 'PEM' }).ssl).toEqual({
      rejectUnauthorized: true,
      ca: 'PEM',
    });
  });
});

describe('postgres-errors', () => {
  const failure = (driverError: object) =>
    new QueryFailedError('INSERT', [], Object.assign(new Error('falló'), driverError));

  it('devuelve la restricción violada solo para el código pedido', () => {
    const error = failure({ code: PG_UNIQUE_VIOLATION, constraint: 'uq_x' });
    expect(violatedConstraint(error, PG_UNIQUE_VIOLATION)).toBe('uq_x');
    expect(violatedConstraint(error, '23503')).toBeUndefined();
    expect(violatedConstraint(failure({ code: PG_UNIQUE_VIOLATION }), PG_UNIQUE_VIOLATION)).toBe(
      '',
    );
    expect(violatedConstraint(new Error('otro'), PG_UNIQUE_VIOLATION)).toBeUndefined();
  });

  it('reconoce los uuid', () => {
    expect(isUuid('6f1c2a4e-3b5d-4c7e-8f90-1a2b3c4d5e6f')).toBe(true);
    expect(isUuid('nope')).toBe(false);
  });
});
