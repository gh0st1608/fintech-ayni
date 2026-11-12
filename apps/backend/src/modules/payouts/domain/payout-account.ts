import { containsAllTokens, nameTokens } from '../../../shared/domain/person-name';
import { ConflictError, DomainError, ValidationError } from '../../../shared/errors/app-error';
import { type PayoutMethodType } from './payout-method';

/**
 * Cuenta donde la persona recibe su payout (COPAYNI-81). Por decisión de negocio (2026-11-12) la
 * registra el personal desde el back-office, no la persona en la app: la app solo la muestra
 * enmascarada. Se cifra el número completo y se guardan solo los 4 últimos dígitos en claro.
 */
export const PAYOUT_ACCOUNT_KINDS = ['bank_account', 'wallet'] as const;
export type PayoutAccountKind = (typeof PAYOUT_ACCOUNT_KINDS)[number];

export const BANK_ACCOUNT_TYPES = ['savings', 'checking'] as const;
export type BankAccountType = (typeof BANK_ACCOUNT_TYPES)[number];

export const WALLET_PROVIDERS = ['yape', 'plin'] as const;
export type WalletProvider = (typeof WALLET_PROVIDERS)[number];

/**
 * Bancos admitidos, por su código de entidad: son los 3 primeros dígitos del CCI. Lista inicial a
 * confirmar con Finanzas [verificar]; agregar un banco es agregar una línea.
 */
export const PERU_BANKS = {
  '002': 'BCP',
  '003': 'Interbank',
  '009': 'Scotiabank',
  '011': 'BBVA',
  '018': 'Banco de la Nación',
  '035': 'Banco Pichincha',
  '038': 'BanBif',
} as const satisfies Record<string, string>;
export type BankCode = keyof typeof PERU_BANKS;
export const BANK_CODES = Object.keys(PERU_BANKS) as BankCode[];

export const WALLET_LABELS: Record<WalletProvider, string> = { yape: 'Yape', plin: 'Plin' };

/** Tipo de método de cobro (COPAYNI-37) que corresponde a cada clase de cuenta. */
export const METHOD_OF_KIND: Record<PayoutAccountKind, PayoutMethodType> = {
  bank_account: 'bank_transfer',
  wallet: 'digital_wallet',
};

/**
 * Dígito de control del CCI (algoritmo de la Cámara de Compensación): pesos 1 y 2 alternados desde
 * la izquierda; si un producto tiene dos cifras se suman; el dígito completa la suma a la decena.
 */
function controlDigit(digits: string): number {
  let sum = 0;
  for (let index = 0; index < digits.length; index++) {
    const product = Number(digits[index]) * (index % 2 === 0 ? 1 : 2);
    sum += product >= 10 ? product - 9 : product;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * CCI de 20 dígitos: entidad (3), oficina (3), cuenta (12) y dos dígitos de control, el primero
 * sobre entidad y oficina y el segundo sobre la cuenta.
 */
export function isValidCci(cci: string): boolean {
  if (!/^\d{20}$/.test(cci)) return false;
  return (
    controlDigit(cci.slice(0, 6)) === Number(cci[18]) &&
    controlDigit(cci.slice(6, 18)) === Number(cci[19])
  );
}

/** Celular peruano: 9 dígitos que empiezan con 9 (Yape y Plin se asocian al celular). */
export const isValidWalletPhone = (phone: string): boolean => /^9\d{8}$/.test(phone);

/** El titular contiene todas las palabras del nombre y del apellido del perfil verificado. */
export function holderMatches(
  holderName: string,
  profile: { firstName: string; lastName: string },
): boolean {
  const holder = nameTokens(holderName);
  return (
    containsAllTokens(holder, nameTokens(profile.firstName)) &&
    containsAllTokens(holder, nameTokens(profile.lastName))
  );
}

export type PayoutAccountInput =
  | {
      kind: 'bank_account';
      bankCode: string;
      accountType: string;
      cci: string;
      holderName: string;
    }
  | { kind: 'wallet'; provider: string; phone: string; holderName: string };

/** Datos ya validados; `number` es el CCI o el celular, que se guarda cifrado. */
export interface ValidPayoutAccount {
  kind: PayoutAccountKind;
  bankCode: BankCode | null;
  accountType: BankAccountType | null;
  walletProvider: WalletProvider | null;
  number: string;
  last4: string;
  holderName: string;
}

const digitsOnly = (value: string): string => value.replace(/[\s-]/g, '');
const includes = <T extends string>(list: readonly T[], value: string): value is T =>
  (list as readonly string[]).includes(value);

/** Valida la entrada y devuelve la cuenta normalizada, o un error por campo. */
export function validatePayoutAccount(input: PayoutAccountInput): ValidPayoutAccount {
  const holderName = input.holderName.trim().replace(/\s+/g, ' ');
  if (nameTokens(holderName).length < 2) {
    throw new ValidationError('Escribe el nombre completo del titular', { holderName: 'invalid' });
  }
  if (input.kind === 'bank_account') {
    const cci = digitsOnly(input.cci);
    if (!includes(BANK_CODES, input.bankCode)) {
      throw new ValidationError('Ese banco no está admitido', { bankCode: 'invalid' });
    }
    if (!includes(BANK_ACCOUNT_TYPES, input.accountType)) {
      throw new ValidationError('Elige ahorros o corriente', { accountType: 'invalid' });
    }
    if (!isValidCci(cci)) {
      throw new ValidationError('El CCI no es válido: revisa los 20 dígitos', { cci: 'invalid' });
    }
    if (cci.slice(0, 3) !== input.bankCode) {
      throw new ValidationError('El CCI no es de ese banco', { cci: 'bank_mismatch' });
    }
    return {
      kind: 'bank_account',
      bankCode: input.bankCode,
      accountType: input.accountType,
      walletProvider: null,
      number: cci,
      last4: cci.slice(14, 18),
      holderName,
    };
  }
  const phone = digitsOnly(input.phone).replace(/^\+?51(?=9\d{8}$)/, '');
  if (!includes(WALLET_PROVIDERS, input.provider)) {
    throw new ValidationError('Elige Yape o Plin', { provider: 'invalid' });
  }
  if (!isValidWalletPhone(phone)) {
    throw new ValidationError('El celular debe tener 9 dígitos y empezar con 9', {
      phone: 'invalid',
    });
  }
  return {
    kind: 'wallet',
    bankCode: null,
    accountType: null,
    walletProvider: input.provider,
    number: phone,
    last4: phone.slice(-4),
    holderName,
  };
}

/** Cuenta guardada, sin el número completo. */
export interface PayoutAccount {
  id: string;
  userId: string;
  kind: PayoutAccountKind;
  bankCode: BankCode | null;
  accountType: BankAccountType | null;
  walletProvider: WalletProvider | null;
  last4: string;
  holderName: string;
  registeredBy: string;
  registeredByEmail: string | null;
  createdAt: Date;
  /** Cuándo la reemplazó otra; `null` si es la vigente. */
  replacedAt: Date | null;
}

/** "BCP •••• 1234" o "Yape •••• 5678": lo único que ven la app y el personal. */
export function maskedLabel(
  account: Pick<PayoutAccount, 'kind' | 'bankCode' | 'walletProvider' | 'last4'>,
): string {
  const name =
    account.kind === 'bank_account'
      ? PERU_BANKS[account.bankCode as BankCode]
      : WALLET_LABELS[account.walletProvider as WalletProvider];
  return `${name} •••• ${account.last4}`;
}

/** El titular de la cuenta tiene que ser la persona verificada en el KYC. */
export class PayoutAccountHolderMismatchError extends DomainError {
  constructor() {
    super(
      'PAYOUT_ACCOUNT_HOLDER_MISMATCH',
      'El titular de la cuenta no coincide con la persona verificada',
      { holderName: 'mismatch' },
    );
  }
}

export class PayoutAccountIdentityRequiredError extends DomainError {
  constructor() {
    super(
      'PAYOUT_ACCOUNT_IDENTITY_REQUIRED',
      'La persona tiene que verificar su identidad antes de registrar su cuenta',
    );
  }
}

/** Regla de COPAYNI-37: en el mes en que cobra, el payout ya se procesa con la cuenta anterior. */
export class PayoutAccountChangeNotAllowedError extends ConflictError {
  constructor() {
    super(
      'PAYOUT_ACCOUNT_CHANGE_NOT_ALLOWED',
      'No se puede cambiar la cuenta durante el mes de cobro de la persona',
    );
  }
}
