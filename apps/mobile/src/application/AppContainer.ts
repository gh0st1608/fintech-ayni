import type { SessionEvents } from '@/application/auth/SessionEvents';
import type { RefreshSessionUseCase } from '@/application/auth/usecases/RefreshSessionUseCase';
import type { ResendOtpUseCase } from '@/application/auth/usecases/ResendOtpUseCase';
import type { RestoreSessionUseCase } from '@/application/auth/usecases/RestoreSessionUseCase';
import type { SignOutUseCase } from '@/application/auth/usecases/SignOutUseCase';
import type { StartAuthenticationUseCase } from '@/application/auth/usecases/StartAuthenticationUseCase';
import type { VerifyOtpUseCase } from '@/application/auth/usecases/VerifyOtpUseCase';
import type { ConfirmSlotSelectionUseCase } from '@/application/circles/usecases/ConfirmSlotSelectionUseCase';
import type { GetJoinConfigUseCase } from '@/application/circles/usecases/GetJoinConfigUseCase';
import type { ListAvailableSlotsUseCase } from '@/application/circles/usecases/ListAvailableSlotsUseCase';
import type { JoinCircleUseCase } from '@/application/circles/usecases/JoinCircleUseCase';
import type { ListInstallmentOptionsUseCase } from '@/application/circles/usecases/ListInstallmentOptionsUseCase';
import type {
  ListPayoutMethodsUseCase,
  SelectPayoutMethodUseCase,
} from '@/application/payouts/usecases/payoutMethodUseCases';
import type { ChangeLanguageUseCase } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import type { ResolveLanguageUseCase } from '@/application/i18n/usecases/ResolveLanguageUseCase';
import type { SyncLanguagePreferenceUseCase } from '@/application/i18n/usecases/SyncLanguagePreferenceUseCase';

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
    listInstallmentOptions: ListInstallmentOptionsUseCase;
    listAvailableSlots: ListAvailableSlotsUseCase;
    confirmSlotSelection: ConfirmSlotSelectionUseCase;
    joinCircle: JoinCircleUseCase;
  };
  payouts: {
    listPayoutMethods: ListPayoutMethodsUseCase;
    selectPayoutMethod: SelectPayoutMethodUseCase;
  };
  i18n: {
    resolveLanguage: ResolveLanguageUseCase;
    changeLanguage: ChangeLanguageUseCase;
    /** Envía el idioma al perfil del backend sin bloquear la UI. */
    syncLanguagePreference: SyncLanguagePreferenceUseCase;
  };
}
