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
];
