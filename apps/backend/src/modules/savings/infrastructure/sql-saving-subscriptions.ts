import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { Money } from '../../../shared/domain/value-objects/money';
import {
  type DueContribution,
  type SavingSubscriptionsPort,
} from '../application/subscription.use-cases';
import {
  type ContributionStatus,
  type SavingSubscription,
  type SubscriptionStatus,
} from '../domain/saving-subscription';

interface SubscriptionRow {
  id: string;
  user_id: string;
  plan_id: string;
  months: number;
  target_amount: string;
  cashback_amount: string;
  currency: string;
  payout_period: string;
  status: SubscriptionStatus;
  rejection: string | null;
  auto_debit: boolean;
  card_id: string;
  created_at: Date;
}

interface ContributionRow {
  id: string;
  subscription_id: string;
  sequence: number;
  due_on: string;
  amount: string;
  status: ContributionStatus;
  paid_at: Date | null;
}

const SUBSCRIPTION_COLUMNS = `id, user_id, plan_id, months, target_amount::text, cashback_amount::text,
  currency, payout_period, status, rejection, auto_debit, card_id, created_at`;
const CONTRIBUTION_COLUMNS = `id, subscription_id, sequence, to_char(due_on, 'YYYY-MM-DD') AS due_on,
  amount::text, status, paid_at`;

@Injectable()
export class SqlSavingSubscriptions implements SavingSubscriptionsPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findByKey(userId: string, idempotencyKey: string): Promise<SavingSubscription | null> {
    const rows = await this.dataSource.query<SubscriptionRow[]>(
      `SELECT ${SUBSCRIPTION_COLUMNS} FROM saving_subscriptions
        WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, idempotencyKey],
    );
    return (await this.hydrate(rows))[0] ?? null;
  }

  async create(
    subscription: SavingSubscription,
    idempotencyKey: string,
  ): Promise<SavingSubscription> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO saving_subscriptions (id, user_id, plan_id, months, target_amount,
           cashback_amount, currency, payout_period, status, auto_debit, card_id, idempotency_key,
           created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          subscription.id,
          subscription.userId,
          subscription.planId,
          subscription.months,
          subscription.target.amount,
          subscription.cashback.amount,
          subscription.target.currency,
          subscription.payoutPeriod,
          subscription.status,
          subscription.autoDebit,
          subscription.cardId,
          idempotencyKey,
          subscription.createdAt,
        ],
      );
      for (const contribution of subscription.contributions) {
        await manager.query(
          `INSERT INTO saving_contributions (id, subscription_id, sequence, due_on, amount, status)
           VALUES ($1, $2, $3, $4, $5, 'pending')`,
          [
            contribution.id,
            subscription.id,
            contribution.sequence,
            contribution.dueOn,
            contribution.amount.amount,
          ],
        );
      }
    });
    return subscription;
  }

  async listOf(userId: string): Promise<SavingSubscription[]> {
    const rows = await this.dataSource.query<SubscriptionRow[]>(
      `SELECT ${SUBSCRIPTION_COLUMNS} FROM saving_subscriptions WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId],
    );
    return this.hydrate(rows);
  }

  async markPaid(contributionId: string, paidAt: Date): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      // Con UPDATE ... RETURNING, TypeORM devuelve [filas, filas afectadas].
      const [rows] = await manager.query<[{ subscription_id: string }[], number]>(
        `UPDATE saving_contributions SET status = 'paid', paid_at = $2
          WHERE id = $1 AND status = 'pending'
        RETURNING subscription_id`,
        [contributionId, paidAt],
      );
      const row = rows[0];
      if (!row) return;
      await manager.query(
        `UPDATE saving_subscriptions s
            SET status = CASE
              WHEN NOT EXISTS (SELECT 1 FROM saving_contributions c
                                WHERE c.subscription_id = s.id AND c.status = 'pending')
                THEN 'completed' ELSE 'active' END
          WHERE s.id = $1 AND s.status IN ('pending', 'active')`,
        [row.subscription_id],
      );
    });
  }

  async reject(subscriptionId: string, detail: string | null): Promise<void> {
    await this.dataSource.query(
      `UPDATE saving_subscriptions SET status = 'rejected', rejection = $2
        WHERE id = $1 AND status = 'pending'`,
      [subscriptionId, detail?.slice(0, 120) ?? null],
    );
  }

  dueForAutoDebit(today: string): Promise<DueContribution[]> {
    return this.due(
      `s.status = 'active' AND s.auto_debit AND c.status = 'pending' AND c.due_on <= $1::date
       AND c.sequence = (SELECT min(p.sequence) FROM saving_contributions p
                          WHERE p.subscription_id = s.id AND p.status = 'pending')`,
      [today],
    );
  }

  pendingFirstPayments(): Promise<DueContribution[]> {
    return this.due(`s.status = 'pending' AND c.sequence = 1`, []);
  }

  private async due(where: string, params: unknown[]): Promise<DueContribution[]> {
    const rows = await this.dataSource.query<
      { subscription_id: string; contribution_id: string }[]
    >(
      `SELECT s.id AS subscription_id, c.id AS contribution_id
         FROM saving_subscriptions s JOIN saving_contributions c ON c.subscription_id = s.id
        WHERE ${where}
        ORDER BY c.due_on LIMIT 500`,
      params,
    );
    if (rows.length === 0) return [];
    const subscriptions = await this.hydrate(
      await this.dataSource.query<SubscriptionRow[]>(
        `SELECT ${SUBSCRIPTION_COLUMNS} FROM saving_subscriptions WHERE id = ANY($1::uuid[])`,
        [rows.map(({ subscription_id }) => subscription_id)],
      ),
    );
    return rows.map(({ subscription_id, contribution_id }) => {
      const subscription = subscriptions.find(({ id }) => id === subscription_id)!;
      return {
        subscription,
        contribution: subscription.contributions.find(({ id }) => id === contribution_id)!,
      };
    });
  }

  private async hydrate(rows: SubscriptionRow[]): Promise<SavingSubscription[]> {
    if (rows.length === 0) return [];
    const contributions = await this.dataSource.query<ContributionRow[]>(
      `SELECT ${CONTRIBUTION_COLUMNS} FROM saving_contributions
        WHERE subscription_id = ANY($1::uuid[]) ORDER BY sequence`,
      [rows.map(({ id }) => id)],
    );
    return rows.map((row) => {
      const currency = row.currency.trim();
      return {
        id: row.id,
        userId: row.user_id,
        planId: row.plan_id,
        months: Number(row.months),
        target: Money.of(Number(row.target_amount), currency),
        cashback: Money.of(Number(row.cashback_amount), currency),
        payoutPeriod: row.payout_period,
        status: row.status,
        rejection: row.rejection,
        autoDebit: row.auto_debit,
        cardId: row.card_id,
        createdAt: new Date(row.created_at),
        contributions: contributions
          .filter(({ subscription_id }) => subscription_id === row.id)
          .map((contribution) => ({
            id: contribution.id,
            sequence: Number(contribution.sequence),
            dueOn: contribution.due_on,
            amount: Money.of(Number(contribution.amount), currency),
            status: contribution.status,
            paidAt: contribution.paid_at ? new Date(contribution.paid_at) : null,
          })),
      };
    });
  }
}
