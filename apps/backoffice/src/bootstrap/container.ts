import {
  ApproveKycUseCase,
  GetCircleUseCase,
  GetCurrentStaffUseCase,
  GetKycPageUrlUseCase,
  GetKycReviewUseCase,
  GetUserUseCase,
  AddSupportNoteUseCase,
  GetPayoutAccountsUseCase,
  ListApprovalsUseCase,
  GetHelpUseCase,
  SaveHelpUseCase,
  ProposeFundMovementUseCase,
  DecideApprovalUseCase,
  RegisterPayoutAccountUseCase,
  ListCycleRunsUseCase,
  ListSupportNotesUseCase,
  RevealUserContactUseCase,
  RevokeUserSessionsUseCase,
  SetUserBlockedUseCase,
  GetGuaranteeFundUseCase,
  ListInstallmentsUseCase,
  ListPayoutsUseCase,
  ListCirclesUseCase,
  ListKycReviewsUseCase,
  RejectKycUseCase,
  SearchUsersUseCase,
  SetCirclePauseUseCase,
  SignInUseCase,
  SignOutUseCase,
} from '@/application/usecases';
import type {
  CirclesRepositoryPort,
  KycRepositoryPort,
  StaffAuthPort,
  UsersRepositoryPort,
  FinanceRepositoryPort,
  CycleRunsRepositoryPort,
  HelpRepositoryPort,
} from '@/domain/ports';
import {
  CirclesApiRepository,
  DevStaffAuth,
  KycApiRepository,
  UsersApiRepository,
  FinanceApiRepository,
  CycleRunsApiRepository,
  HelpApiRepository,
} from '@/infrastructure/api/adapters';
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
  kyc: {
    list: ListKycReviewsUseCase;
    get: GetKycReviewUseCase;
    pageUrl: GetKycPageUrlUseCase;
    approve: ApproveKycUseCase;
    reject: RejectKycUseCase;
  };
  users: {
    search: SearchUsersUseCase;
    get: GetUserUseCase;
    revokeSessions: RevokeUserSessionsUseCase;
    setBlocked: SetUserBlockedUseCase;
    revealContact: RevealUserContactUseCase;
    notes: ListSupportNotesUseCase;
    addNote: AddSupportNoteUseCase;
    payoutAccounts: GetPayoutAccountsUseCase;
    registerPayoutAccount: RegisterPayoutAccountUseCase;
  };
  cycleRuns: {
    list: ListCycleRunsUseCase;
  };
  help: {
    get: GetHelpUseCase;
    save: SaveHelpUseCase;
  };
  finance: {
    installments: ListInstallmentsUseCase;
    payouts: ListPayoutsUseCase;
    guaranteeFund: GetGuaranteeFundUseCase;
    approvals: ListApprovalsUseCase;
    proposeMovement: ProposeFundMovementUseCase;
    decide: DecideApprovalUseCase;
  };
}

export interface ContainerAdapters {
  auth: StaffAuthPort;
  circles: CirclesRepositoryPort;
  kyc: KycRepositoryPort;
  users: UsersRepositoryPort;
  finance: FinanceRepositoryPort;
  cycleRuns: CycleRunsRepositoryPort;
  help: HelpRepositoryPort;
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
    kyc: {
      list: new ListKycReviewsUseCase(adapters.kyc),
      get: new GetKycReviewUseCase(adapters.kyc),
      pageUrl: new GetKycPageUrlUseCase(adapters.kyc),
      approve: new ApproveKycUseCase(adapters.kyc),
      reject: new RejectKycUseCase(adapters.kyc),
    },
    users: {
      search: new SearchUsersUseCase(adapters.users),
      get: new GetUserUseCase(adapters.users),
      revokeSessions: new RevokeUserSessionsUseCase(adapters.users),
      setBlocked: new SetUserBlockedUseCase(adapters.users),
      revealContact: new RevealUserContactUseCase(adapters.users),
      notes: new ListSupportNotesUseCase(adapters.users),
      addNote: new AddSupportNoteUseCase(adapters.users),
      payoutAccounts: new GetPayoutAccountsUseCase(adapters.users),
      registerPayoutAccount: new RegisterPayoutAccountUseCase(adapters.users),
    },
    cycleRuns: {
      list: new ListCycleRunsUseCase(adapters.cycleRuns),
    },
    help: {
      get: new GetHelpUseCase(adapters.help),
      save: new SaveHelpUseCase(adapters.help),
    },
    finance: {
      installments: new ListInstallmentsUseCase(adapters.finance),
      payouts: new ListPayoutsUseCase(adapters.finance),
      guaranteeFund: new GetGuaranteeFundUseCase(adapters.finance),
      approvals: new ListApprovalsUseCase(adapters.finance),
      proposeMovement: new ProposeFundMovementUseCase(adapters.finance),
      decide: new DecideApprovalUseCase(adapters.finance),
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
    kyc: new KycApiRepository(http),
    users: new UsersApiRepository(http),
    finance: new FinanceApiRepository(http),
    cycleRuns: new CycleRunsApiRepository(http),
    help: new HelpApiRepository(http),
  });
}
