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

/**
 * Levanta la API completa (AppModule + configureApp, igual que main.ts) sin abrir un puerto.
 * `extraModules` permite montar rutas de prueba sobre la misma configuración global.
 */
export async function createTestApp(
  options: { extraModules?: Type[]; verifier?: AccessTokenVerifierPort | null } = {},
): Promise<NestExpressApplication> {
  const builder = Test.createTestingModule({
    imports: [AppModule, ...(options.extraModules ?? [])],
  });
  if (options.verifier !== null) {
    builder.overrideProvider(ACCESS_TOKEN_VERIFIER).useValue(options.verifier ?? fakeTokenVerifier);
  }
  const moduleRef = await builder.compile();
  const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>(APP_OPTIONS));
  await app.init();
  return app;
}
