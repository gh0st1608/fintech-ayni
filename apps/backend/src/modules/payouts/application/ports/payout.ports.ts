import { type Period } from '../../../../shared/domain/value-objects/period';
import { type PayoutAccount } from '../../domain/payout-account';
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

export const PAYOUT_ACCOUNTS = Symbol('PAYOUT_ACCOUNTS');
export const PAYOUT_ACCOUNT_OWNERS = Symbol('PAYOUT_ACCOUNT_OWNERS');

/** Lo que se guarda al registrar una cuenta; `encryptedNumber` ya viene cifrado. */
export interface NewPayoutAccount {
  id: string;
  userId: string;
  kind: PayoutAccount['kind'];
  bankCode: PayoutAccount['bankCode'];
  accountType: PayoutAccount['accountType'];
  walletProvider: PayoutAccount['walletProvider'];
  encryptedNumber: string;
  last4: string;
  holderName: string;
  registeredBy: string;
  registeredByEmail: string | null;
  reason: string;
  method: PayoutMethodType;
  at: Date;
}

/** Cuentas de cobro: nunca se borran; registrar una nueva reemplaza la vigente. */
export interface PayoutAccountRepositoryPort {
  current(userId: string): Promise<PayoutAccount | null>;
  /** Todas, de la más reciente a la más antigua. */
  history(userId: string): Promise<PayoutAccount[]>;
  /** Reemplaza la vigente y elige el método de cobro que le corresponde, en una transacción. */
  register(account: NewPayoutAccount): Promise<PayoutAccount>;
}

/** Datos de la persona que hacen falta para validar al titular. */
export interface PayoutAccountOwner {
  firstName: string | null;
  lastName: string | null;
  identityVerified: boolean;
}

export interface PayoutAccountOwnerPort {
  /** `null` si la persona no existe. */
  find(userId: string): Promise<PayoutAccountOwner | null>;
}
