import { type Type } from '@nestjs/common';
import { type NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';

import { AppModule } from '@src/app.module';
import { APP_OPTIONS, configureApp } from '@src/app.setup';
import {
  ACCESS_TOKEN_VERIFIER,
  type AccessTokenVerifierPort,
  type Principal,
} from '@src/shared/application/ports/access-token-verifier.port';
import { CLOCK, type ClockPort } from '@src/shared/application/ports/clock.port';
import { UnauthorizedError } from '@src/shared/errors/app-error';

export const VALID_TOKEN = 'token-valido';
export const TEST_PRINCIPAL: Principal = { userId: 'user-1' };

/** Verificador de prueba: solo acepta VALID_TOKEN. Reemplaza al de producción (rechaza todo). */
export const fakeTokenVerifier: AccessTokenVerifierPort = {
  verify: (token) =>
    token === VALID_TOKEN
      ? Promise.resolve(TEST_PRINCIPAL)
      : Promise.reject(new UnauthorizedError()),
};

/** Reloj que la prueba adelanta a voluntad. */
export class TestClock implements ClockPort {
  constructor(private current = new Date('2026-11-02T15:00:00Z')) {}

  now(): Date {
    return new Date(this.current);
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }

  set(date: Date): void {
    this.current = new Date(date);
  }
}

/**
 * Levanta la API completa (AppModule + configureApp, igual que main.ts) sin abrir un puerto.
 * - `extraModules` monta rutas de prueba sobre la misma configuración global.
 * - `verifier: null` usa el verificador real de JWT (módulo auth).
 * - `clock` reemplaza el reloj del sistema.
 */
export async function createTestApp(
  options: {
    extraModules?: Type[];
    verifier?: AccessTokenVerifierPort | null;
    clock?: ClockPort;
  } = {},
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule, ...(options.extraModules ?? [])],
  });
  if (options.verifier !== null) {
    builder.overrideProvider(ACCESS_TOKEN_VERIFIER).useValue(options.verifier ?? fakeTokenVerifier);
  }
  if (options.clock) builder.overrideProvider(CLOCK).useValue(options.clock);
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS));
  await app.init();
  return app;
}
