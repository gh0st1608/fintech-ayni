/**
 * Cuenta de cobro del payout (COPAYNI-81). La registra el personal con la constancia que envía la
 * persona; la app solo la muestra enmascarada. El backend valida todo de nuevo: aquí se valida para
 * avisar antes de enviar.
 */
export const PAYOUT_ACCOUNT_KINDS = ['bank_account', 'wallet'] as const;
export type PayoutAccountKind = (typeof PAYOUT_ACCOUNT_KINDS)[number];

export const BANK_ACCOUNT_TYPES = ['savings', 'checking'] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const WALLET_PROVIDERS = ['yape', 'plin'] as const;
export type WalletProvider = (typeof WALLET_PROVIDERS)[number];

export interface PayoutAccount {
  id: string;
  kind: PayoutAccountKind;
  /** "BCP •••• 1234": nunca llega el número completo. */
  label: string;
  bankCode: string | null;
  bankName: string | null;
  accountType: BankAccountType | null;
  walletProvider: WalletProvider | null;
  last4: string;
  holderName: string;
  registeredAt: Date;
  registeredBy: string;
  registeredByEmail: string | null;
  replacedAt: Date | null;
}

export interface PayoutAccounts {
  current: PayoutAccount | null;
  history: PayoutAccount[];
  /** Bancos admitidos por el backend, por código (los 3 primeros dígitos del CCI). */
  banks: Record<string, string>;
}

export type PayoutAccountForm =
  | {
      kind: 'bank_account';
      bankCode: string;
      accountType: BankAccountType;
      cci: string;
      holderName: string;
    }
  | { kind: 'wallet'; provider: WalletProvider; phone: string; holderName: string };

export const KIND_LABELS: Record<PayoutAccountKind, string> = {
  bank_account: 'Cuenta bancaria',
  wallet: 'Yape / Plin',
};

export const ACCOUNT_TYPE_LABELS: Record<BankAccountType, string> = {
  savings: 'Ahorros',
  checking: 'Corriente',
};

export const WALLET_LABELS: Record<WalletProvider, string> = { yape: 'Yape', plin: 'Plin' };

function controlDigit(digits: string): number {
  let sum = 0;
  for (let index = 0; index < digits.length; index++) {
    const product = Number(digits[index]) * (index % 2 === 0 ? 1 : 2);
    sum += product >= 10 ? product - 9 : product;
  }
  return (10 - (sum % 10)) % 10;
}

/** Quita espacios y guiones: "002-193-…" → "002193…". */
export const onlyDigits = (value: string): string => value.replace(/[\s-]/g, '');

/** CCI de 20 dígitos con sus dos dígitos de control (el mismo algoritmo que el backend). */
export function isValidCci(value: string): boolean {
  const cci = onlyDigits(value);
  if (!/^\d{20}$/.test(cci)) return false;
  return (
    controlDigit(cci.slice(0, 6)) === Number(cci[18]) &&
    controlDigit(cci.slice(6, 18)) === Number(cci[19])
  );
}

/** Celular de 9 dígitos que empieza con 9; acepta el prefijo +51. */
export function isValidWalletPhone(value: string): boolean {
  return /^9\d{8}$/.test(onlyDigits(value).replace(/^\+?51(?=9\d{8}$)/, ''));
}
