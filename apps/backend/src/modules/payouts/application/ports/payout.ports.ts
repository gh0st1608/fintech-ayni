import { type Period } from '../../../../shared/domain/value-objects/period';
import { type PayoutMethodCatalog, type PayoutMethodType } from '../../domain/payout-method';

export const PAYOUT_METHOD_CATALOG = Symbol('PAYOUT_METHOD_CATALOG');
export const PAYOUT_METHOD_REPOSITORY = Symbol('PAYOUT_METHOD_REPOSITORY');
export const PAYOUT_SCHEDULE = Symbol('PAYOUT_SCHEDULE');
export const PAYOUT_SETTINGS = Symbol('PAYOUT_SETTINGS');

export interface PayoutSettings {
  /** Zona IANA que define el mes actual (la misma que los cronogramas de círculos). */
  readonly timeZone: string;
}

export interface PayoutMethodCatalogPort {
  /** Catálogo para el usuario (por ahora el mismo para todos; por país cuando se defina T5). */
  forUser(userId: string): Promise<PayoutMethodCatalog>;
}

export interface PayoutMethodRepositoryPort {
  selectedBy(userId: string): Promise<PayoutMethodType | null>;
  select(userId: string, type: PayoutMethodType): Promise<void>;
}

/** Meses en que el usuario cobra, según sus membresías en círculos. */
export interface PayoutSchedulePort {
  payoutPeriodsOf(userId: string): Promise<Period[]>;
}
