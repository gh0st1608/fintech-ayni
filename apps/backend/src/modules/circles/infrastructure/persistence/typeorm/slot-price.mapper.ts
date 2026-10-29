import { Money } from '../../../../../shared/domain/value-objects/money';
import { SLOT_TYPES, type SlotPrice, type SlotType } from '../../../domain/services/slot-pricing';

/** Precio congelado en la columna jsonb `circle_memberships.price`: montos en unidades menores. */
export interface StoredSlotPrice {
  currency: string;
  type: SlotType;
  fee: number;
  discount: number;
  adminFee: number;
  netPayout: number;
  installments: number[];
  /** Puesta al día de quien tomó una vacante (COPAYNI-59). */
  catchUp?: number[];
  /** Retención del payout (COPAYNI-60). */
  retention?: number;
}

export const toStoredPrice = (price: SlotPrice): StoredSlotPrice => ({
  currency: price.netPayout.currency,
  type: price.type,
  fee: price.fee.amount,
  discount: price.discount.amount,
  adminFee: price.adminFee.amount,
  netPayout: price.netPayout.amount,
  installments: price.installments.map(({ amount }) => amount),
  ...(price.catchUp && { catchUp: price.catchUp.map(({ amount }) => amount) }),
  ...(price.retention && { retention: price.retention.amount }),
});

/** Money.of rechaza montos que no son enteros; el círculo valida moneda y número de cuotas. */
export function fromStoredPrice(stored: StoredSlotPrice): SlotPrice {
  if (
    !SLOT_TYPES.includes(stored.type) ||
    !Array.isArray(stored.installments) ||
    (stored.catchUp !== undefined && !Array.isArray(stored.catchUp))
  ) {
    throw new Error('El precio guardado de la membresía no es válido');
  }
  const money = (amount: number) => Money.of(amount, stored.currency);
  return {
    type: stored.type,
    fee: money(stored.fee),
    discount: money(stored.discount),
    adminFee: money(stored.adminFee),
    netPayout: money(stored.netPayout),
    installments: stored.installments.map(money),
    ...(stored.catchUp && { catchUp: stored.catchUp.map(money) }),
    ...(stored.retention !== undefined && { retention: money(stored.retention) }),
  };
}
