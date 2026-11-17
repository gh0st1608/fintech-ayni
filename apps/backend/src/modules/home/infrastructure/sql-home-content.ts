import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { type HomeContentPort } from '../application/home-content';
import {
  type ContentTarget,
  type ContentTexts,
  type GoalBackground,
  type GoalInput,
  type HomeGoal,
  type HomeOffer,
  type Illustration,
  type OfferBackground,
  type OfferInput,
} from '../domain/home-content';

interface ItemRow {
  id: string;
  texts: ContentTexts;
  illustration: Illustration;
  background: string;
  target: ContentTarget;
  target_amount: string | number | null;
  position: number;
  active: boolean;
  updated_at: Date;
  updated_by: string | null;
}

interface OfferRow extends ItemRow {
  starts_on: Date | null;
  ends_on: Date | null;
}

/** `bigint` llega como texto del driver; el monto va en unidades menores. */
const toAmount = (value: string | number | null): number | null =>
  value === null ? null : Number(value);

const base = (row: ItemRow) => ({
  id: row.id,
  texts: row.texts,
  illustration: row.illustration,
  target: row.target,
  targetAmount: toAmount(row.target_amount),
  position: row.position,
  active: row.active,
  updatedAt: new Date(row.updated_at),
  updatedBy: row.updated_by,
});

const toOffer = (row: OfferRow): HomeOffer => ({
  ...base(row),
  background: row.background as OfferBackground,
  startsOn: row.starts_on ? new Date(row.starts_on) : null,
  endsOn: row.ends_on ? new Date(row.ends_on) : null,
});

const toGoal = (row: ItemRow): HomeGoal => ({
  ...base(row),
  background: row.background as GoalBackground,
});

const OFFER_COLUMNS = `id, texts, illustration, background, target, target_amount, starts_on,
                       ends_on, position, active, updated_at, updated_by`;
const GOAL_COLUMNS = `id, texts, illustration, background, target, target_amount, position,
                      active, updated_at, updated_by`;

/** Ofertas y metas de Home (COPAYNI-25), editables desde el back-office. */
@Injectable()
export class SqlHomeContent implements HomeContentPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async listOffers(): Promise<HomeOffer[]> {
    const rows = await this.dataSource.query<OfferRow[]>(
      `SELECT ${OFFER_COLUMNS} FROM home_offers ORDER BY position, created_at`,
    );
    return rows.map(toOffer);
  }

  async listGoals(): Promise<HomeGoal[]> {
    const rows = await this.dataSource.query<ItemRow[]>(
      `SELECT ${GOAL_COLUMNS} FROM home_goals ORDER BY position, created_at`,
    );
    return rows.map(toGoal);
  }

  async saveOffer(id: string | null, input: OfferInput, by: string, at: Date): Promise<HomeOffer> {
    const values = [
      JSON.stringify(input.texts),
      input.illustration,
      input.background,
      input.target,
      input.targetAmount,
      input.startsOn,
      input.endsOn,
      input.position,
      input.active,
      by,
      at,
    ];
    // UPDATE ... RETURNING devuelve [filas, afectadas]; INSERT ... RETURNING, solo las filas.
    const rows = id
      ? (
          await this.dataSource.query<[OfferRow[], number]>(
            `UPDATE home_offers
              SET texts = $1::jsonb, illustration = $2, background = $3, target = $4,
                  target_amount = $5, starts_on = $6, ends_on = $7, position = $8, active = $9,
                  updated_by = $10, updated_at = $11
            WHERE id = $12::uuid
        RETURNING ${OFFER_COLUMNS}`,
            [...values, id],
          )
        )[0]
      : await this.dataSource.query<OfferRow[]>(
          `INSERT INTO home_offers (texts, illustration, background, target, target_amount,
                                    starts_on, ends_on, position, active, updated_by, updated_at)
                VALUES ($1::jsonb, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             RETURNING ${OFFER_COLUMNS}`,
          values,
        );
    const saved = rows[0];
    if (!saved) throw new Error('No se pudo guardar la oferta');
    return toOffer(saved);
  }

  async saveGoal(id: string | null, input: GoalInput, by: string, at: Date): Promise<HomeGoal> {
    const values = [
      JSON.stringify(input.texts),
      input.illustration,
      input.background,
      input.target,
      input.targetAmount,
      input.position,
      input.active,
      by,
      at,
    ];
    const rows = id
      ? (
          await this.dataSource.query<[ItemRow[], number]>(
            `UPDATE home_goals
              SET texts = $1::jsonb, illustration = $2, background = $3, target = $4,
                  target_amount = $5, position = $6, active = $7, updated_by = $8, updated_at = $9
            WHERE id = $10::uuid
        RETURNING ${GOAL_COLUMNS}`,
            [...values, id],
          )
        )[0]
      : await this.dataSource.query<ItemRow[]>(
          `INSERT INTO home_goals (texts, illustration, background, target, target_amount,
                                   position, active, updated_by, updated_at)
                VALUES ($1::jsonb, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING ${GOAL_COLUMNS}`,
          values,
        );
    const saved = rows[0];
    if (!saved) throw new Error('No se pudo guardar la meta');
    return toGoal(saved);
  }

  async removeOffer(id: string): Promise<boolean> {
    const [, deleted] = await this.dataSource.query<[unknown[], number]>(
      'DELETE FROM home_offers WHERE id = $1::uuid',
      [id],
    );
    return deleted > 0;
  }

  async removeGoal(id: string): Promise<boolean> {
    const [, deleted] = await this.dataSource.query<[unknown[], number]>(
      'DELETE FROM home_goals WHERE id = $1::uuid',
      [id],
    );
    return deleted > 0;
  }
}
