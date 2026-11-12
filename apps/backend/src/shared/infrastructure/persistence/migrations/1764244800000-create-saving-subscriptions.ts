import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Suscripciones al programa de ahorro y su calendario de aportes (COPAYNI-79). La clave de
 * idempotencia es única por persona: repetir la confirmación no crea otra ni cobra dos veces.
 */
export class CreateSavingSubscriptions1764244800000 implements MigrationInterface {
  name = 'CreateSavingSubscriptions1764244800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE saving_subscriptions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        plan_id varchar(32) NOT NULL,
        months smallint NOT NULL CHECK (months >= 1),
        target_amount bigint NOT NULL CHECK (target_amount > 0),
        cashback_amount bigint NOT NULL CHECK (cashback_amount >= 0),
        currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        payout_period char(7) NOT NULL CHECK (payout_period ~ '^[0-9]{4}-[0-9]{2}$'),
        status varchar(16) NOT NULL CHECK (status IN ('pending', 'active', 'rejected', 'completed')),
        rejection varchar(120),
        auto_debit boolean NOT NULL,
        card_id uuid NOT NULL,
        idempotency_key varchar(255) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_saving_subscriptions_key UNIQUE (user_id, idempotency_key)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE saving_contributions (
        id uuid PRIMARY KEY,
        subscription_id uuid NOT NULL REFERENCES saving_subscriptions (id) ON DELETE RESTRICT,
        sequence smallint NOT NULL CHECK (sequence >= 1),
        due_on date NOT NULL,
        amount bigint NOT NULL CHECK (amount > 0),
        status varchar(16) NOT NULL CHECK (status IN ('pending', 'paid')),
        paid_at timestamptz,
        CONSTRAINT uq_saving_contributions_sequence UNIQUE (subscription_id, sequence),
        CONSTRAINT ck_saving_contributions_paid CHECK ((status = 'paid') = (paid_at IS NOT NULL))
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_saving_subscriptions_user ON saving_subscriptions (user_id, created_at DESC)',
    );
    await queryRunner.query(
      `CREATE INDEX ix_saving_contributions_due ON saving_contributions (due_on)
        WHERE status = 'pending'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE saving_contributions');
    await queryRunner.query('DROP TABLE saving_subscriptions');
  }
}
