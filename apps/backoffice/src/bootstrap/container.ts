import {
  GetCircleUseCase,
  GetCurrentStaffUseCase,
  ListCirclesUseCase,
  SetCirclePauseUseCase,
  SignInUseCase,
  SignOutUseCase,
} from '@/application/usecases';
import type { CirclesRepositoryPort, StaffAuthPort } from '@/domain/ports';
import { CirclesApiRepository, DevStaffAuth } from '@/infrastructure/api/adapters';
import { FetchHttpClient } from '@/infrastructure/http/FetchHttpClient';
import { TokenStore } from '@/infrastructure/http/TokenStore';

import type { AppConfig } from './env';

export interface AppContainer {
  auth: {
    signIn: SignInUseCase;
    current: GetCurrentStaffUseCase;
    signOut: SignOutUseCase;
  };
  circles: {
    list: ListCirclesUseCase;
    get: GetCircleUseCase;
    setPause: SetCirclePauseUseCase;
  };
}

export interface ContainerAdapters {
  auth: StaffAuthPort;
  circles: CirclesRepositoryPort;
}

/** Casos de uso sobre los adaptadores dados; las pruebas pasan dobles. */
export function createContainer(adapters: ContainerAdapters): AppContainer {
  return {
    auth: {
      signIn: new SignInUseCase(adapters.auth),
      current: new GetCurrentStaffUseCase(adapters.auth),
      signOut: new SignOutUseCase(adapters.auth),
    },
    circles: {
      list: new ListCirclesUseCase(adapters.circles),
      get: new GetCircleUseCase(adapters.circles),
      setPause: new SetCirclePauseUseCase(adapters.circles),
    },
  };
}

/** Único punto donde se eligen las implementaciones concretas (base técnica §7). */
export function createAppContainer(config: AppConfig): AppContainer {
  const tokens = new TokenStore();
  const http = new FetchHttpClient(config.apiUrl, tokens, config.httpTimeoutMs);
  return createContainer({
    auth: new DevStaffAuth(http, tokens),
    circles: new CirclesApiRepository(http),
  });
}
