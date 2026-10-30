import type { CardRepositoryPort } from '@/domain/payments/ports/CardRepositoryPort';
import type { SavedCard } from '@/domain/payments/SavedCard';
import { AppError } from '@/domain/shared/errors/AppError';
import { simulateLatency } from '@/infrastructure/fake/simulateLatency';

/** Tarjetas falsas (solo dev y pruebas), con las reglas del backend (docs/api/payments.md). */
export class InMemoryCardRepository implements CardRepositoryPort {
  private cards: SavedCard[] = [];
  private readonly byKey = new Map<string, SavedCard>();
  private readonly latencyMs: number;
  private sequence = 0;

  constructor(options: { latencyMs?: number; cards?: SavedCard[] } = {}) {
    this.latencyMs = options.latencyMs ?? 300;
    this.cards = [...(options.cards ?? [])];
  }

  async list(signal?: AbortSignal): Promise<SavedCard[]> {
    await simulateLatency(this.latencyMs, signal);
    return this.sorted();
  }

  async add(token: string, idempotencyKey: string): Promise<SavedCard> {
    await simulateLatency(this.latencyMs);
    const previous = this.byKey.get(idempotencyKey);
    if (previous) return previous;
    const [, brand = 'visa', lastFour = '0000', month = '12', year = '2030'] = token.split('-');
    this.sequence += 1;
    const card: SavedCard = {
      id: `card-${this.sequence}`,
      brand,
      lastFour,
      expirationMonth: Number(month),
      expirationYear: Number(year),
      isDefault: this.cards.length === 0,
    };
    this.cards.push(card);
    this.byKey.set(idempotencyKey, card);
    return card;
  }

  async setDefault(cardId: string): Promise<SavedCard[]> {
    await simulateLatency(this.latencyMs);
    this.find(cardId);
    this.cards = this.cards.map((card) => ({ ...card, isDefault: card.id === cardId }));
    return this.sorted();
  }

  async remove(cardId: string): Promise<void> {
    await simulateLatency(this.latencyMs);
    const card = this.find(cardId);
    if (card.isDefault && this.cards.length > 1) {
      throw new AppError('conflict', 'Choose another default first', {
        code: 'DEFAULT_CARD_REPLACEMENT_REQUIRED',
      });
    }
    this.cards = this.cards.filter(({ id }) => id !== cardId);
  }

  private find(cardId: string): SavedCard {
    const card = this.cards.find(({ id }) => id === cardId);
    if (!card) throw new AppError('not_found', 'Card not found', { code: 'CARD_NOT_FOUND' });
    return card;
  }

  private sorted(): SavedCard[] {
    return [...this.cards].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
  }
}
