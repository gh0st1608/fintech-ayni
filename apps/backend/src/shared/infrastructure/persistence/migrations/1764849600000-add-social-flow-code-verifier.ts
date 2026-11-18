import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * PKCE para el flujo web de Google (COPAYNI-91 §9). El `code_verifier` se guarda aquí, en el
 * servidor, y solo se envía al canjear el código: quien intercepte el `code` en la vuelta no puede
 * canjearlo sin este valor.
 *
 * Nulo para los intentos de Apple, que no usan PKCE porque su `client_secret` es un JWT firmado
 * con la clave `.p8` y cumple el mismo papel.
 */
export class AddSocialFlowCodeVerifier1764849600000 implements MigrationInterface {
  name = 'AddSocialFlowCodeVerifier1764849600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE social_auth_flows ADD COLUMN code_verifier char(43)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE social_auth_flows DROP COLUMN code_verifier');
  }
}
