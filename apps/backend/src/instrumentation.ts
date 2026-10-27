/**
 * Primer import de main.ts: OpenTelemetry tiene que registrarse antes de que se carguen http,
 * express, NestJS y pino para poder instrumentarlos. Por eso aquí solo se importan la
 * validación de entorno (sin NestJS) y la telemetría.
 */
// Los decoradores de la validación de entorno lo necesitan; no carga módulos instrumentados.
import 'reflect-metadata';

import { existsSync } from 'node:fs';

import { validateEnvironment } from './config/env.validation';
import { startTelemetry } from './shared/infrastructure/observability/telemetry';

// ConfigModule lee .env más tarde; la telemetría lo necesita antes. Igual que ConfigModule,
// las variables ya definidas en el entorno tienen prioridad.
if (process.env.NODE_ENV !== 'test' && existsSync('.env')) process.loadEnvFile('.env');

try {
  startTelemetry(validateEnvironment(process.env));
} catch (error) {
  // El mensaje de validación nombra las variables y reglas, nunca sus valores.
  const message = error instanceof Error ? error.message : 'Error al iniciar la telemetría';
  process.stderr.write(`${JSON.stringify({ level: 'fatal', context: 'Bootstrap', message })}\n`);
  process.exit(1);
}
