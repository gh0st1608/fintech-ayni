import { DomainError } from '@/domain/shared/errors/DomainError';
import type { Money } from '@/domain/shared/value-objects/Money';

/** Tipos del Figma (Payout Method, 55:9520). El catálogo real lo decide el backend (T5). */
export const PAYOUT_METHOD_TYPES = [
  'digitalWallet',
  'prepaidCard',
  'bankTransfer',
  'fawry',
] as const;
export type PayoutMethodType = (typeof PAYOUT_METHOD_TYPES)[number];

export type PayoutMethodBadge = 'noCharge';

/** El método no está en el catálogo o está deshabilitado. */
export class PayoutMethodNotAvailableError extends DomainError {
  readonly code = 'PAYOUT_METHOD_NOT_AVAILABLE';
}

/** El backend rechaza el cambio: el usuario está en su mes de payout. */
export class PayoutMethodChangeNotAllowedError extends DomainError {
  readonly code = 'PAYOUT_METHOD_CHANGE_NOT_ALLOWED';
}

/** Un método de cobro del catálogo, con sus badges y su límite por payout. */
export class PayoutMethod {
  private constructor(
    readonly type: PayoutMethodType,
    readonly available: boolean,
    readonly badges: readonly PayoutMethodBadge[],
    readonly limit: Money | null,
  ) {}

  static create(props: {
    type: PayoutMethodType;
    available: boolean;
    badges?: readonly PayoutMethodBadge[];
    limit?: Money | null;
  }): PayoutMethod {
    return new PayoutMethod(
      props.type,
      props.available,
      [...(props.badges ?? [])],
      props.limit ?? null,
    );
  }

  get isFree(): boolean {
    return this.badges.includes('noCharge');
  }
}

/** Catálogo con el método elegido, que la pantalla preselecciona. */
export interface PayoutMethods {
  methods: PayoutMethod[];
  selected: PayoutMethodType | null;
}
