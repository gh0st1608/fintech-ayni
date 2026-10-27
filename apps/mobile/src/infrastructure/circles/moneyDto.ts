import { z } from 'zod';

import { Money } from '@/domain/shared/value-objects/Money';

/** Monto del backend: entero en unidades menores con su moneda ISO 4217. */
export const moneyDto = z.object({
  amount: z.number().int(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});

export function toMoney(dto: z.infer<typeof moneyDto>): Money {
  return Money.of(dto.amount, dto.currency);
}
