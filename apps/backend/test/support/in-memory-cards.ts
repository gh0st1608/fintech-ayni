import { type GatewayCard } from '@src/modules/payments/application/ports/payment-gateway.port';
import {
  type SavedCard,
  type SavedCardRepositoryPort,
} from '@src/modules/payments/application/ports/saved-card-repository.port';

/** Doble con la semántica del puerto: una tarjeta por (usuario, tarjeta de la pasarela). */
export class InMemoryCards implements SavedCardRepositoryPort {
  readonly customers = new Map<string, string>();
  readonly cards: (SavedCard & { userId: string; key: string })[] = [];

  customerOf(userId: string): Promise<string | null> {
    return Promise.resolve(this.customers.get(userId) ?? null);
  }
  saveCustomer(userId: string, customerId: string): Promise<void> {
    this.customers.set(userId, customerId);
    return Promise.resolve();
  }
  findByIdempotencyKey(userId: string, key: string): Promise<SavedCard | null> {
    return Promise.resolve(this.cards.find((c) => c.userId === userId && c.key === key) ?? null);
  }
  add(userId: string, card: GatewayCard, key: string): Promise<SavedCard> {
    const existing = this.cards.find((c) => c.userId === userId && c.gatewayCardId === card.id);
    if (existing) return Promise.resolve(existing);
    const saved = {
      ...card,
      id: `sc-${this.cards.length + 1}`,
      gatewayCardId: card.id,
      isDefault: !this.cards.some((c) => c.userId === userId),
      createdAt: new Date(),
      userId,
      key,
    };
    this.cards.push(saved);
    return Promise.resolve(saved);
  }
  list(userId: string): Promise<SavedCard[]> {
    return Promise.resolve(this.cards.filter((c) => c.userId === userId));
  }
  setDefault(userId: string, cardId: string): Promise<boolean> {
    const card = this.cards.find((c) => c.userId === userId && c.id === cardId);
    if (!card) return Promise.resolve(false);
    for (const other of this.cards) if (other.userId === userId) other.isDefault = other === card;
    return Promise.resolve(true);
  }
  remove(userId: string, cardId: string): Promise<void> {
    const index = this.cards.findIndex((c) => c.userId === userId && c.id === cardId);
    if (index >= 0) this.cards.splice(index, 1);
    return Promise.resolve();
  }
}
