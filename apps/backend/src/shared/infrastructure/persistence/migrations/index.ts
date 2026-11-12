import { CreateCircles1761652800000 } from './1761652800000-create-circles';
import { CreateAuth1761739200000 } from './1761739200000-create-auth';
import { CreatePayoutMethods1761825600000 } from './1761825600000-create-payout-methods';
import { AddJoinIdempotency1761912000000 } from './1761912000000-add-join-idempotency';
import { AddMembershipPrice1761998400000 } from './1761998400000-add-membership-price';
import { CreateCircleCycle1762084800000 } from './1762084800000-create-circle-cycle';
import { AddDelinquency1762171200000 } from './1762171200000-add-delinquency';
import { CreateGuaranteeFund1762257600000 } from './1762257600000-create-guarantee-fund';
import { AllowTurnReplacement1762344000000 } from './1762344000000-allow-turn-replacement';
import { AddPayoutRetention1762430400000 } from './1762430400000-add-payout-retention';
import { AddCirclePause1762516800000 } from './1762516800000-add-circle-pause';
import { AddPayinDeduction1762603200000 } from './1762603200000-add-payin-deduction';
import { CreateSavedCards1762689600000 } from './1762689600000-create-saved-cards';
import { AddPersonalInfo1762776000000 } from './1762776000000-add-personal-info';
import { CreateReferrals1762862400000 } from './1762862400000-create-referrals';
import { AddReferralDiscount1762948800000 } from './1762948800000-add-referral-discount';
import { CreateKycDocuments1763035200000 } from './1763035200000-create-kyc-documents';
import { CreateUserPasscodes1763121600000 } from './1763121600000-create-user-passcodes';
import { AddCircleStartApproval1763208000000 } from './1763208000000-add-circle-start-approval';
import { AddStartProposalRound1763294400000 } from './1763294400000-add-start-proposal-round';
import { CreateStaffAuditLog1763380800000 } from './1763380800000-create-staff-audit-log';
import { AddKycReview1763467200000 } from './1763467200000-add-kyc-review';
import { AddBackofficeSupport1763553600000 } from './1763553600000-add-backoffice-support';
import { AddMembershipTermsAcceptance1763640000000 } from './1763640000000-add-membership-terms-acceptance';
import { CreateIdentityVerifications1763726400000 } from './1763726400000-create-identity-verifications';
import { CreatePayoutAccounts1763812800000 } from './1763812800000-create-payout-accounts';
import { CreateStaffApprovals1763899200000 } from './1763899200000-create-staff-approvals';

/** Migraciones en orden. Se listan explícitamente: el build no depende de globs. */
export const MIGRATIONS = [
  CreateCircles1761652800000,
  CreateAuth1761739200000,
  CreatePayoutMethods1761825600000,
  AddJoinIdempotency1761912000000,
  AddMembershipPrice1761998400000,
  CreateCircleCycle1762084800000,
  AddDelinquency1762171200000,
  CreateGuaranteeFund1762257600000,
  AllowTurnReplacement1762344000000,
  AddPayoutRetention1762430400000,
  AddCirclePause1762516800000,
  AddPayinDeduction1762603200000,
  CreateSavedCards1762689600000,
  AddPersonalInfo1762776000000,
  CreateReferrals1762862400000,
  AddReferralDiscount1762948800000,
  CreateKycDocuments1763035200000,
  CreateUserPasscodes1763121600000,
  AddCircleStartApproval1763208000000,
  AddStartProposalRound1763294400000,
  CreateStaffAuditLog1763380800000,
  AddKycReview1763467200000,
  AddBackofficeSupport1763553600000,
  AddMembershipTermsAcceptance1763640000000,
  CreateIdentityVerifications1763726400000,
  CreatePayoutAccounts1763812800000,
  CreateStaffApprovals1763899200000,
];
