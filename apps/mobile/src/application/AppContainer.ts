import type { ResendOtpUseCase } from '@/application/auth/usecases/ResendOtpUseCase';
import type { RestoreSessionUseCase } from '@/application/auth/usecases/RestoreSessionUseCase';
import type { SignOutUseCase } from '@/application/auth/usecases/SignOutUseCase';
import type { StartAuthenticationUseCase } from '@/application/auth/usecases/StartAuthenticationUseCase';
import type { VerifyOtpUseCase } from '@/application/auth/usecases/VerifyOtpUseCase';
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
    startAuthentication: StartAuthenticationUseCase;
    verifyOtp: VerifyOtpUseCase;
    resendOtp: ResendOtpUseCase;
  };
  i18n: {
    resolveLanguage: ResolveLanguageUseCase;
    changeLanguage: ChangeLanguageUseCase;
  };
}
