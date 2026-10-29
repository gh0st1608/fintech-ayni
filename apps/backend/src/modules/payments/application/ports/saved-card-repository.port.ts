import { type GatewayCard } from './payment-gateway.port';

export const SAVED_CARDS = Symbol('SAVED_CARDS');

/** Tarjeta guardada del usuario (COPAYNI-40): solo datos no sensibles y el id de la pasarela. */
export interface SavedCard extends Omit<GatewayCard, 'id'> {
  id: string;
  /** Id de la tarjeta en la pasarela. */
  gatewayCardId: string;
  /** Con la que se cobran las cuotas. */
  isDefault: boolean;
  createdAt: Date;
}

export interface SavedCardRepositoryPort {
  /** El cliente de la pasarela del usuario, o `null` si todavía no tiene. */
  customerOf(userId: string): Promise<string | null>;
  saveCustomer(userId: string, customerId: string): Promise<void>;
  /** La tarjeta guardada con esa clave de idempotencia, o `null`. */
  findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<SavedCard | null>;
  /**
   * Guarda la tarjeta; la primera del usuario queda predeterminada. Si ya tenía esa tarjeta de la
   * pasarela, devuelve la existente (la pasarela reconoce la misma tarjeta).
   */
  add(userId: string, card: GatewayCard, idempotencyKey: string): Promise<SavedCard>;
  /** De la predeterminada a las demás, de la más nueva a la más vieja. */
  list(userId: string): Promise<SavedCard[]>;
  /** La deja como la única predeterminada del usuario. `false` si no es suya o no existe. */
  setDefault(userId: string, cardId: string): Promise<boolean>;
  /** La marca como borrada. */
  remove(userId: string, cardId: string): Promise<void>;
}
