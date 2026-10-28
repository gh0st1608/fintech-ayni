import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { type AppConfigService } from '../../../config/configuration';
import { DatabaseReadinessIndicator } from './database-readiness.indicator';
import { dataSourceOptions } from './typeorm-options';

/**
 * Conexión a PostgreSQL con TypeORM. Cada módulo registra sus entidades con
 * `TypeOrmModule.forFeature`; las entidades viven en su capa de infraestructura y nunca llegan
 * al dominio.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: AppConfigService) => ({
        ...dataSourceOptions({
          DB_HOST: config.get('DB_HOST', { infer: true }),
          DB_PORT: config.get('DB_PORT', { infer: true }),
          DB_NAME: config.get('DB_NAME', { infer: true }),
          DB_USERNAME: config.get('DB_USERNAME', { infer: true }),
          DB_PASSWORD: config.get('DB_PASSWORD', { infer: true }),
          DB_SSL: config.get('DB_SSL', { infer: true }),
          DB_SSL_CA: config.get('DB_SSL_CA', { infer: true }),
          DB_POOL_MAX: config.get('DB_POOL_MAX', { infer: true }),
          APP_NAME: config.get('APP_NAME', { infer: true }),
        }),
        autoLoadEntities: true,
        // Sin reintentos al arrancar: ECS reinicia la tarea y el health check la saca del balanceador.
        retryAttempts: 0,
      }),
    }),
  ],
  providers: [DatabaseReadinessIndicator],
  exports: [DatabaseReadinessIndicator],
})
export class DatabaseModule {}
