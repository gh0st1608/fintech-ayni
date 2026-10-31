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
import type { ListMyCirclesUseCase } from '@/application/circles/usecases/ListMyCirclesUseCase';
import type { ListRecommendedCirclesUseCase } from '@/application/circles/usecases/ListRecommendedCirclesUseCase';
import type {
  AddCardUseCase,
  ListCardsUseCase,
  PayInstallmentUseCase,
  RemoveCardUseCase,
  SetDefaultCardUseCase,
} from '@/application/payments/usecases/cardUseCases';
import type {
  GetPaymentSettingsUseCase,
  GetPaymentSummaryUseCase,
  GetPayoutEligibilityUseCase,
  ListTransactionsUseCase,
  UpdatePaymentSettingsUseCase,
} from '@/application/payments/usecases/paymentUseCases';
import type {
  ListPayoutMethodsUseCase,
  SelectPayoutMethodUseCase,
} from '@/application/payouts/usecases/payoutMethodUseCases';
import type { ChangeLanguageUseCase } from '@/application/i18n/usecases/ChangeLanguageUseCase';
import type { ResolveLanguageUseCase } from '@/application/i18n/usecases/ResolveLanguageUseCase';
import type {
  CapturePendingReferralUseCase,
  ClaimPendingReferralUseCase,
  CopyReferralCodeUseCase,
  GetMyReferralUseCase,
  ListReferralsUseCase,
  ShareInviteUseCase,
} from '@/application/referrals/usecases/referralUseCases';
import type { IdGeneratorPort } from '@/domain/shared/ports/IdGeneratorPort';
import type {
  GetMyProfileUseCase,
  StartContactChangeUseCase,
  UpdatePersonalInfoUseCase,
  VerifyContactChangeUseCase,
} from '@/application/profile/usecases/profileUseCases';
import type {
  ListDocumentsUseCase,
  SubmitNationalIdUseCase,
  SubmitProofOfIncomeUseCase,
} from '@/application/documents/usecases/documentUseCases';
import type { FilePickerPort } from '@/domain/documents/ports/FilePorts';
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
  /** Claves de idempotencia de los formularios (una por formulario). */
  ids: IdGeneratorPort;
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
    listMyCircles: ListMyCirclesUseCase;
    listRecommended: ListRecommendedCirclesUseCase;
  };
  payments: {
    getSummary: GetPaymentSummaryUseCase;
    listTransactions: ListTransactionsUseCase;
    getPayoutEligibility: GetPayoutEligibilityUseCase;
    getSettings: GetPaymentSettingsUseCase;
    updateSettings: UpdatePaymentSettingsUseCase;
    listCards: ListCardsUseCase;
    addCard: AddCardUseCase;
    setDefaultCard: SetDefaultCardUseCase;
    removeCard: RemoveCardUseCase;
    payInstallment: PayInstallmentUseCase;
  };
  profile: {
    getMyProfile: GetMyProfileUseCase;
    updatePersonalInfo: UpdatePersonalInfoUseCase;
    startContactChange: StartContactChangeUseCase;
    verifyContactChange: VerifyContactChangeUseCase;
  };
  documents: {
    list: ListDocumentsUseCase;
    submitNationalId: SubmitNationalIdUseCase;
    submitProofOfIncome: SubmitProofOfIncomeUseCase;
    /** Cámara, galería y archivos del dispositivo. */
    picker: FilePickerPort;
  };
  referrals: {
    getMine: GetMyReferralUseCase;
    list: ListReferralsUseCase;
    copyCode: CopyReferralCodeUseCase;
    shareInvite: ShareInviteUseCase;
    /** Código de un enlace de invitación, antes o después de iniciar sesión. */
    capturePending: CapturePendingReferralUseCase;
    /** Envía el código pendiente al entrar con sesión, sin bloquear la UI. */
    claimPending: ClaimPendingReferralUseCase;
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
