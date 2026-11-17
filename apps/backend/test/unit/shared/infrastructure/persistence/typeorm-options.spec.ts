import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  type DatabaseSettings,
  dataSourceOptions,
} from '../../../../../src/shared/infrastructure/persistence/typeorm-options';

const settings = (overrides: Partial<DatabaseSettings> = {}): DatabaseSettings => ({
  DB_HOST: 'localhost',
  DB_PORT: 5432,
  DB_NAME: 'ayni',
  DB_USERNAME: 'ayni_app',
  DB_PASSWORD: 'secreto',
  DB_SSL: false,
  DB_POOL_MAX: 10,
  APP_NAME: 'ayni-api',
  ...overrides,
});

/** `DataSourceOptions` es una unión y `ssl` solo existe en la rama de postgres. */
const sslOf = (overrides: Partial<DatabaseSettings> = {}): unknown =>
  (dataSourceOptions(settings(overrides)) as { ssl?: unknown }).ssl;

function pemFile(contents: string): string {
  const path = join(mkdtempSync(join(tmpdir(), 'ayni-ca-')), 'rds-ca.pem');
  writeFileSync(path, contents);
  return path;
}

describe('dataSourceOptions', () => {
  it('sin TLS no configura ssl', () => {
    expect(sslOf()).toBe(false);
  });

  it('con TLS siempre verifica el certificado del servidor', () => {
    expect(sslOf({ DB_SSL: true })).toEqual({ rejectUnauthorized: true });
  });

  it('lee la CA del archivo que trae la imagen', () => {
    const path = pemFile('-----BEGIN CERTIFICATE-----\nrds\n-----END CERTIFICATE-----\n');

    expect(sslOf({ DB_SSL: true, DB_SSL_CA_FILE: path })).toEqual({
      rejectUnauthorized: true,
      ca: '-----BEGIN CERTIFICATE-----\nrds\n-----END CERTIFICATE-----\n',
    });
  });

  it('el PEM literal gana al archivo', () => {
    const path = pemFile('del archivo');

    expect(sslOf({ DB_SSL: true, DB_SSL_CA: 'literal', DB_SSL_CA_FILE: path })).toEqual({
      rejectUnauthorized: true,
      ca: 'literal',
    });
  });

  it('falla diciendo qué archivo no pudo leer, en vez de conectarse sin CA', () => {
    expect(() => sslOf({ DB_SSL: true, DB_SSL_CA_FILE: '/no/existe/rds-ca.pem' })).toThrow(
      'No se pudo leer DB_SSL_CA_FILE: /no/existe/rds-ca.pem',
    );
  });

  it('no lee el archivo cuando TLS está apagado', () => {
    expect(() => sslOf({ DB_SSL: false, DB_SSL_CA_FILE: '/no/existe/rds-ca.pem' })).not.toThrow();
  });

  it('nunca sincroniza el esquema: solo migraciones', () => {
    const options = dataSourceOptions(settings());

    expect(options).toMatchObject({ synchronize: false, migrationsRun: false, logging: false });
  });
});
