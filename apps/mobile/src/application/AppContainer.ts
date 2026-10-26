import type { RestoreSessionUseCase } from '@/application/auth/usecases/RestoreSessionUseCase';
import type { SignInUseCase } from '@/application/auth/usecases/SignInUseCase';
import type { SignOutUseCase } from '@/application/auth/usecases/SignOutUseCase';
import type { ChangeLanguageUseCase } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import type { ResolveLanguageUseCase } from '@/application/i18n/usecases/ResolveLanguageUseCase';

/**
 * Lo que la capa de presentación puede usar. Se construye en bootstrap/container.ts;
 * las pruebas lo sustituyen por dobles sin tocar infraestructura real.
 */
export interface AppContainer {
  config: {
    environment: 'dev' | 'staging' | 'prod';
  };
  auth: {
    restoreSession: RestoreSessionUseCase;
    signIn: SignInUseCase;
    signOut: SignOutUseCase;
  };
  i18n: {
    resolveLanguage: ResolveLanguageUseCase;
    changeLanguage: ChangeLanguageUseCase;
  };
}
