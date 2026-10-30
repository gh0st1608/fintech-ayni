import { z } from 'zod';

import type { CardRepositoryPort } from '@/domain/payments/ports/CardRepositoryPort';
import type { SavedCard } from '@/domain/payments/SavedCard';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

/** DTO de una tarjeta guardada (docs/api/payments.md). */
const cardDto = z.object({
  id: z.string().min(1),
  brand: z.string().min(1),
  lastFour: z.string().regex(/^\d{4}$/),
  expirationMonth: z.number().int().min(1).max(12),
  expirationYear: z.number().int(),
  isDefault: z.boolean(),
});
const cardsDto = z.object({ items: z.array(cardDto) });

/** Adaptador HTTP de las tarjetas guardadas (COPAYNI-39 y 40). */
export class CardApiRepository implements CardRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async list(signal?: AbortSignal): Promise<SavedCard[]> {
    const dto = await this.http.get('/me/cards', { signal, parse: (data) => cardsDto.parse(data) });
    return dto.items;
  }

  add(token: string, idempotencyKey: string): Promise<SavedCard> {
    return this.http.post('/me/cards', {
      idempotencyKey,
      body: { token },
      parse: (data) => cardDto.parse(data),
    });
  }

  async setDefault(cardId: string): Promise<SavedCard[]> {
    const dto = await this.http.put(`/me/cards/${encodeURIComponent(cardId)}/default`, {
      parse: (data) => cardsDto.parse(data),
    });
    return dto.items;
  }

  async remove(cardId: string): Promise<void> {
    await this.http.delete(`/me/cards/${encodeURIComponent(cardId)}`);
  }
}
