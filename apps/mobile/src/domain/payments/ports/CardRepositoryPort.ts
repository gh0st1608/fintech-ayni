import type { SavedCard } from '../SavedCard';

/** Tarjetas guardadas del usuario (docs/api/payments.md, COPAYNI-39 y 40). */
export interface CardRepositoryPort {
  /** La predeterminada primero. */
  list(signal?: AbortSignal): Promise<SavedCard[]>;
  /** Guarda la tarjeta del token. Con la misma clave, un reintento devuelve la misma tarjeta. */
  add(token: string, idempotencyKey: string): Promise<SavedCard>;
  /** Devuelve la lista actualizada. */
  setDefault(cardId: string): Promise<SavedCard[]>;
  remove(cardId: string): Promise<void>;
}
