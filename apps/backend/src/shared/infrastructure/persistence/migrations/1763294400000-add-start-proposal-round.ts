import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Número de ronda de la propuesta de inicio (COPAYNI-62): cada ronda nueva lo incrementa y la
 * respuesta del miembro debe traer la ronda que vio, para no aceptar condiciones que cambiaron.
 */
export class AddStartProposalRound1763294400000 implements MigrationInterface {
  name = 'AddStartProposalRound1763294400000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE circle_start_proposals ADD COLUMN round integer NOT NULL DEFAULT 1 CHECK (round >= 1)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE circle_start_proposals DROP COLUMN round');
  }
}
