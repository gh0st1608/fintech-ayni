import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { isUuid } from '../../../../shared/infrastructure/persistence/postgres-errors';
import { type GatewayCard } from '../../application/ports/payment-gateway.port';
import {
  type SavedCard,
  type SavedCardRepositoryPort,
} from '../../application/ports/saved-card-repository.port';

interface CardRow {
  id: string;
  gateway_card_id: string;
  brand: string;
  last_four: string;
  expiration_month: number;
  expiration_year: number;
  is_default: boolean;
  created_at: Date;
}

const toCard = (row: CardRow): SavedCard => ({
  id: row.id,
  gatewayCardId: row.gateway_card_id,
  brand: row.brand,
  lastFour: row.last_four,
  expirationMonth: row.expiration_month,
  expirationYear: row.expiration_year,
  isDefault: row.is_default,
  createdAt: new Date(row.created_at),
});

const COLUMNS = `id, gateway_card_id, brand, last_four, expiration_month, expiration_year,
  is_default, created_at`;

/** SavedCardRepositoryPort sobre PostgreSQL (`payment_customers` y `saved_cards`). */
@Injectable()
export class SqlSavedCardRepository implements SavedCardRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async customerOf(userId: string): Promise<string | null> {
    if (!isUuid(userId)) return null;
    const [row] = await this.dataSource.query<{ customer_id: string }[]>(
      'SELECT customer_id FROM payment_customers WHERE user_id = $1',
      [userId],
    );
    return row?.customer_id ?? null;
  }

  async saveCustomer(userId: string, customerId: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO payment_customers (user_id, customer_id) VALUES ($1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId, customerId],
    );
  }

  async findByIdempotencyKey(userId: string, idempotencyKey: string): Promise<SavedCard | null> {
    if (!isUuid(userId)) return null;
    const [row] = await this.dataSource.query<CardRow[]>(
      `SELECT ${COLUMNS} FROM saved_cards
        WHERE user_id = $1 AND idempotency_key = $2 AND deleted_at IS NULL`,
      [userId, idempotencyKey],
    );
    return row ? toCard(row) : null;
  }

  add(userId: string, card: GatewayCard, idempotencyKey: string): Promise<SavedCard> {
    return this.dataSource.transaction(async (manager) => {
      // Serializa las altas del usuario: la primera tarjeta es la única predeterminada.
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended('cards:' || $1, 0))", [
        userId,
      ]);
      const [existing] = await manager.query<CardRow[]>(
        `SELECT ${COLUMNS} FROM saved_cards
          WHERE user_id = $1 AND gateway_card_id = $2 AND deleted_at IS NULL`,
        [userId, card.id],
      );
      if (existing) return toCard(existing);
      const [row] = await manager.query<CardRow[]>(
        `INSERT INTO saved_cards (id, user_id, gateway_card_id, brand, last_four,
                                  expiration_month, expiration_year, is_default, idempotency_key)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6,
                 NOT EXISTS (SELECT 1 FROM saved_cards
                              WHERE user_id = $1 AND is_default AND deleted_at IS NULL), $7)
         RETURNING ${COLUMNS}`,
        [
          userId,
          card.id,
          card.brand,
          card.lastFour,
          card.expirationMonth,
          card.expirationYear,
          idempotencyKey,
        ],
      );
      return toCard(row!);
    });
  }

  async setDefault(userId: string, cardId: string): Promise<boolean> {
    if (!isUuid(userId) || !isUuid(cardId)) return false;
    return this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended('cards:' || $1, 0))", [
        userId,
      ]);
      const [exists] = await manager.query<unknown[]>(
        'SELECT 1 FROM saved_cards WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL',
        [userId, cardId],
      );
      if (!exists) return false;
      await manager.query(
        `UPDATE saved_cards SET is_default = false
          WHERE user_id = $1 AND is_default AND id <> $2 AND deleted_at IS NULL`,
        [userId, cardId],
      );
      await manager.query('UPDATE saved_cards SET is_default = true WHERE id = $1', [cardId]);
      return true;
    });
  }

  async remove(userId: string, cardId: string): Promise<void> {
    if (!isUuid(userId) || !isUuid(cardId)) return;
    await this.dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended('cards:' || $1, 0))", [
        userId,
      ]);
      await manager.query(
        `UPDATE saved_cards SET deleted_at = now(), is_default = false
          WHERE user_id = $1 AND id = $2 AND deleted_at IS NULL`,
        [userId, cardId],
      );
    });
  }

  async list(userId: string): Promise<SavedCard[]> {
    if (!isUuid(userId)) return [];
    const rows = await this.dataSource.query<CardRow[]>(
      `SELECT ${COLUMNS} FROM saved_cards WHERE user_id = $1 AND deleted_at IS NULL
        ORDER BY is_default DESC, created_at DESC, id`,
      [userId],
    );
    return rows.map(toCard);
  }
}
