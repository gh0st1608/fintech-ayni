import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Inicio de un círculo incompleto con la aprobación de sus miembros (COPAYNI-62, R2): la propuesta
 * vigente y las respuestas de cada miembro. Una ronda nueva reemplaza la propuesta y borra las
 * respuestas.
 */
export class AddCircleStartApproval1763208000000 implements MigrationInterface {
  name = 'AddCircleStartApproval1763208000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE circles DROP CONSTRAINT ck_circles_cycle_state,
        ADD CONSTRAINT ck_circles_cycle_state CHECK (cycle_state IN
          ('collecting', 'approving', 'contributing', 'finished', 'paused', 'cancelled'))
    `);
    await queryRunner.query(`
      CREATE TABLE circle_start_proposals (
        circle_id uuid PRIMARY KEY REFERENCES circles (id) ON DELETE CASCADE,
        payout_amount bigint NOT NULL CHECK (payout_amount > 0),
        months smallint NOT NULL CHECK (months >= 2),
        respond_by date NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE circle_start_responses (
        circle_id uuid NOT NULL REFERENCES circles (id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
        decision varchar(16) NOT NULL CHECK (decision IN ('accepted', 'withdrawn')),
        responded_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (circle_id, user_id)
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE circle_start_responses');
    await queryRunner.query('DROP TABLE circle_start_proposals');
    await queryRunner.query(`
      ALTER TABLE circles DROP CONSTRAINT ck_circles_cycle_state,
        ADD CONSTRAINT ck_circles_cycle_state CHECK (cycle_state IN
          ('collecting', 'contributing', 'finished', 'paused'))
    `);
  }
}
