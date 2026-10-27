import type { SessionEvents } from '@/application/auth/SessionEvents';
import type { RefreshSessionUseCase } from '@/application/auth/usecases/RefreshSessionUseCase';
import type { ResendOtpUseCase } from '@/application/auth/usecases/ResendOtpUseCase';
import type { RestoreSessionUseCase } from '@/application/auth/usecases/RestoreSessionUseCase';
import type { SignOutUseCase } from '@/application/auth/usecases/SignOutUseCase';
import type { StartAuthenticationUseCase } from '@/application/auth/usecases/StartAuthenticationUseCase';
import type { VerifyOtpUseCase } from '@/application/auth/usecases/VerifyOtpUseCase';
import type { GetJoinConfigUseCase } from '@/application/circles/usecases/GetJoinConfigUseCase';
import type { ChangeLanguageUseCase } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import type { ResolveLanguageUseCase } from '@/application/i18n/usecases/ResolveLanguageUseCase';

/**
 * Lo que la capa de presentación puede usar. Se construye en bootstrap/container.ts;
 * las pruebas lo sustituyen por dobles sin tocar infraestructura real.
 */
export interface AppContainer {
  config: {
    environment: 'dev' | 'staging' | 'prod';
    /** ISO 4217 por defecto mientras el backend no devuelva la moneda de cada monto (M1). */
    defaultCurrency: string;
    /** Enlaces legales del login; sin URL configurada el texto no es pulsable (pending-scope L4). */
    legal: { termsUrl?: string; privacyUrl?: string };
  };
  auth: {
    restoreSession: RestoreSessionUseCase;
    signOut: SignOutUseCase;
    refreshSession: RefreshSessionUseCase;
    /** Expiraciones detectadas fuera de la UI (p. ej. un 401 sin renovación posible). */
    sessionEvents: Pick<SessionEvents, 'subscribe'>;
    startAuthentication: StartAuthenticationUseCase;
    verifyOtp: VerifyOtpUseCase;
    resendOtp: ResendOtpUseCase;
  };
  circles: {
    getJoinConfig: GetJoinConfigUseCase;
  };
  i18n: {
    resolveLanguage: ResolveLanguageUseCase;
    changeLanguage: ChangeLanguageUseCase;
  };
}
