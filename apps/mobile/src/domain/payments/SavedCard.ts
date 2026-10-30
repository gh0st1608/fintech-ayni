/** Tarjeta guardada en la pasarela (GET /me/cards, COPAYNI-39). Nunca hay número completo. */
export interface SavedCard {
  id: string;
  /** Marca según la pasarela (visa, master, amex…). */
  brand: string;
  lastFour: string;
  expirationMonth: number;
  expirationYear: number;
  /** Con ella se cobran las cuotas por débito automático. */
  isDefault: boolean;
}
