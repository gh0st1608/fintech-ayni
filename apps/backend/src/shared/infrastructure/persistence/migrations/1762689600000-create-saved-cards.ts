import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Tarjetas guardadas (COPAYNI-40): el cliente de la pasarela de cada usuario y sus tarjetas, solo
 * con datos no sensibles (nunca PAN ni CVC). Una tarjeta borrada se marca, no se elimina: los
 * pagos ya hechos la referencian en la pasarela.
 */
export class CreateSavedCards1762689600000 implements MigrationInterface {
  name = 'CreateSavedCards1762689600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE payment_customers (
        user_id uuid PRIMARY KEY REFERENCES users (id) ON DELETE RESTRICT,
        customer_id varchar(64) NOT NULL UNIQUE,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE saved_cards (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        gateway_card_id varchar(64) NOT NULL,
        brand varchar(32) NOT NULL,
        last_four char(4) NOT NULL CHECK (last_four ~ '^[0-9]{4}$'),
        expiration_month smallint NOT NULL CHECK (expiration_month BETWEEN 1 AND 12),
        expiration_year smallint NOT NULL CHECK (expiration_year BETWEEN 2000 AND 2100),
        is_default boolean NOT NULL DEFAULT false,
        idempotency_key varchar(255) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        deleted_at timestamptz
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_saved_cards_gateway_card ON saved_cards (user_id, gateway_card_id)
        WHERE deleted_at IS NULL`,
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_saved_cards_idempotency_key ON saved_cards (user_id, idempotency_key)',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_saved_cards_default ON saved_cards (user_id)
        WHERE is_default AND deleted_at IS NULL`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE saved_cards');
    await queryRunner.query('DROP TABLE payment_customers');
  }
}
