import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Círculos y membresías (COPAYNI-24). Los índices únicos son la barrera final de la reserva de
 * slots: solo chocan las solicitudes que compiten por el mismo slot, usuario o clave.
 *
 * `user_id` todavía no tiene clave foránea: la tabla de usuarios llega con el módulo auth.
 */
export class CreateCircles1761652800000 implements MigrationInterface {
  name = 'CreateCircles1761652800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE circles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        payout_amount bigint NOT NULL CHECK (payout_amount > 0),
        currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
        months smallint NOT NULL CHECK (months >= 2),
        starts_on date NOT NULL CHECK (extract(day FROM starts_on) = 1),
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_circles_exact_installment CHECK (payout_amount % months = 0)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE circle_memberships (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        circle_id uuid NOT NULL REFERENCES circles (id) ON DELETE RESTRICT,
        user_id uuid NOT NULL,
        position smallint NOT NULL CHECK (position >= 1),
        idempotency_key varchar(255) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_circle_memberships_position UNIQUE (circle_id, position),
        CONSTRAINT uq_circle_memberships_user UNIQUE (circle_id, user_id),
        CONSTRAINT uq_circle_memberships_idempotency_key UNIQUE (circle_id, idempotency_key)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_circle_memberships_user_id ON circle_memberships (user_id)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE circle_memberships');
    await queryRunner.query('DROP TABLE circles');
  }
}
