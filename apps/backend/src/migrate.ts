/**
 * Aplica las migraciones pendientes y termina. En los ambientes desplegados corre como tarea
 * ECS de una sola vez antes de actualizar el servicio (ADR 2): si falla, no se despliega.
 *
 *   node dist/migrate.js
 */
import 'reflect-metadata';

import { existsSync } from 'node:fs';

import { DataSource } from 'typeorm';

import { validateEnvironment } from './config/env.validation';
import { ensureApplicationRole } from './shared/infrastructure/persistence/app-role';
import { dataSourceOptions } from './shared/infrastructure/persistence/typeorm-options';

const log = (level: 'info' | 'fatal', message: string): void => {
  process.stdout.write(`${JSON.stringify({ level, context: 'Migrations', message })}\n`);
};

async function migrate(): Promise<void> {
  if (existsSync('.env')) process.loadEnvFile('.env');
  const environment = validateEnvironment(process.env);
  const dataSource = new DataSource(dataSourceOptions(environment));
  await dataSource.initialize();
  try {
    // Cada migración en su propia transacción: una que falla no deja cambios a medias.
    const applied = await dataSource.runMigrations({ transaction: 'each' });
    log(
      'info',
      applied.length > 0
        ? `Migraciones aplicadas: ${applied.map(({ name }) => name).join(', ')}`
        : 'Sin migraciones pendientes',
    );

    // Después de migrar, para que las tablas nuevas queden con permisos (COPAYNI-12).
    if (environment.DB_APP_USERNAME && environment.DB_APP_PASSWORD) {
      // Una sola conexión: el ajuste de logging de la sesión no vale para otra del pool.
      const connection = dataSource.createQueryRunner();
      await connection.connect();
      try {
        const outcome = await ensureApplicationRole(connection, {
          username: environment.DB_APP_USERNAME,
          password: environment.DB_APP_PASSWORD,
          database: environment.DB_NAME,
        });
        log('info', `Usuario de aplicación ${environment.DB_APP_USERNAME}: ${outcome}`);
      } finally {
        await connection.release();
      }
    } else {
      log('info', 'Sin DB_APP_USERNAME: no se tocan los roles de la base');
    }
  } finally {
    await dataSource.destroy();
  }
}

migrate().catch((error: unknown) => {
  // Ni la configuración ni el error del driver incluyen la contraseña.
  log('fatal', error instanceof Error ? error.message : 'Error al migrar');
  process.exit(1);
});
