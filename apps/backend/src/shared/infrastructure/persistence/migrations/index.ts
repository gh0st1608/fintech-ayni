import { CreateCircles1761652800000 } from './1761652800000-create-circles';
import { CreateAuth1761739200000 } from './1761739200000-create-auth';
import { CreatePayoutMethods1761825600000 } from './1761825600000-create-payout-methods';
import { AddJoinIdempotency1761912000000 } from './1761912000000-add-join-idempotency';

/** Migraciones en orden. Se listan explícitamente: el build no depende de globs. */
export const MIGRATIONS = [
  CreateCircles1761652800000,
  CreateAuth1761739200000,
  CreatePayoutMethods1761825600000,
  AddJoinIdempotency1761912000000,
];
