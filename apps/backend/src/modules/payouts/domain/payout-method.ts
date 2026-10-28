import { type Money } from '../../../shared/domain/value-objects/money';
import { DomainError } from '../../../shared/errors/app-error';

/** Tipos de método de cobro del Figma (Payout Method, 55:9520). Los proveedores locales están pendientes (T5). */
export const PAYOUT_METHOD_TYPES = [
  'digital_wallet',
  'prepaid_card',
  'bank_transfer',
  'fawry',
] as const;
export type PayoutMethodType = (typeof PAYOUT_METHOD_TYPES)[number];

export const PAYOUT_METHOD_BADGES = ['no_charge'] as const;
export type PayoutMethodBadge = (typeof PAYOUT_METHOD_BADGES)[number];

export class PayoutMethodNotAvailableError extends DomainError {
  constructor() {
    super('PAYOUT_METHOD_NOT_AVAILABLE', 'Ese método de cobro no está disponible');
  }
}

export class PayoutMethodChangeNotAllowedError extends DomainError {
  constructor() {
    super(
      'PAYOUT_METHOD_CHANGE_NOT_ALLOWED',
      'Solo puedes cambiar el método de cobro antes de tu mes de payout',
    );
  }
}

export interface PayoutMethod {
  readonly type: PayoutMethodType;
  /** `false`: se muestra deshabilitado ("Not available") y no se puede elegir. */
  readonly available: boolean;
  readonly badges: readonly PayoutMethodBadge[];
  /** Máximo que admite el método por payout (p. ej. la tarjeta prepago), o `null`. */
  readonly limit: Money | null;
}

/** Catálogo de métodos que se ofrecen, en el orden en que se muestran. */
export class PayoutMethodCatalog {
  private constructor(readonly methods: readonly PayoutMethod[]) {}

  static create(methods: readonly PayoutMethod[]): PayoutMethodCatalog {
    const types = methods.map(({ type }) => type);
    if (new Set(types).size !== types.length) {
      throw new DomainError('INVALID_PAYOUT_METHODS', 'El catálogo repite métodos de cobro');
    }
    return new PayoutMethodCatalog(methods.map((method) => ({ ...method })));
  }

  /** El método si existe y está disponible; si no, PAYOUT_METHOD_NOT_AVAILABLE. */
  selectable(type: string): PayoutMethod {
    const method = this.methods.find((candidate) => candidate.type === type);
    if (!method?.available) throw new PayoutMethodNotAvailableError();
    return method;
  }
}
