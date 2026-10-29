import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Reemplazo del turno del expulsado (COPAYNI-59): la membresía del expulsado se conserva y otro
 * miembro toma su turno, así que el turno es único solo entre quienes siguen en el círculo.
 */
export class AllowTurnReplacement1762344000000 implements MigrationInterface {
  name = 'AllowTurnReplacement1762344000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE circle_memberships DROP CONSTRAINT uq_circle_memberships_position',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_circle_memberships_position ON circle_memberships (circle_id, position)
        WHERE expelled_at IS NULL`,
    );
  }

  /** Falla si ya hay turnos reemplazados: dos membresías con el mismo turno. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX uq_circle_memberships_position');
    await queryRunner.query(
      `ALTER TABLE circle_memberships
         ADD CONSTRAINT uq_circle_memberships_position UNIQUE (circle_id, position)`,
    );
  }
}
