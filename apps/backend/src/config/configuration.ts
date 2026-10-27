import { type ConfigModuleOptions, type ConfigService } from '@nestjs/config';

import { type EnvironmentVariables, validateEnvironment } from './env.validation';

/** ConfigService tipado: `config.get('PORT', { infer: true })` devuelve `number`. */
export type AppConfigService = ConfigService<EnvironmentVariables, true>;

/**
 * Única puerta de entrada a las variables de entorno. Lee `.env` solo si existe (desarrollo);
 * en los ambientes desplegados las variables llegan del entorno o del gestor de secretos.
 */
export const configModuleOptions: ConfigModuleOptions = {
  isGlobal: true,
  cache: true,
  validate: validateEnvironment,
  // Las pruebas usan solo las variables de test/setup-env.ts, nunca el .env local.
  ignoreEnvFile: process.env.NODE_ENV === 'test',
};
