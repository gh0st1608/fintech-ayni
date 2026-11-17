import { type MigrationInterface, type QueryRunner } from 'typeorm';

/**
 * Contenido de Home (COPAYNI-25, BO4 y BO5; docs/home-content-plan.md): las láminas del carrusel
 * de ofertas y las tarjetas de metas populares. El texto va por idioma en `texts`, la ilustración
 * es una clave del catálogo de la app y el destino una lista cerrada de pantallas, nunca una URL.
 *
 * Se siembra **una sola meta**, la que apunta a una función que ya existe en el producto (los
 * planes de ahorro con cashback). Las campañas de Perú las decide el PO y se cargan desde el
 * back-office: sembrar ejemplos del diseño de Marruecos ("Ramadan") sería inventar contenido.
 */
export class CreateHomeContent1764676800000 implements MigrationInterface {
  name = 'CreateHomeContent1764676800000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE home_offers (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        texts jsonb NOT NULL,
        illustration varchar(32) NOT NULL,
        background varchar(16) NOT NULL,
        target varchar(24) NOT NULL,
        target_amount bigint,
        starts_on timestamptz,
        ends_on timestamptz,
        position integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by varchar(255),
        CONSTRAINT ck_home_offers_amount CHECK (target_amount IS NULL OR target_amount > 0),
        CONSTRAINT ck_home_offers_window CHECK (
          starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on
        )
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_home_offers_order ON home_offers (position, created_at)',
    );

    await queryRunner.query(`
      CREATE TABLE home_goals (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        texts jsonb NOT NULL,
        illustration varchar(32) NOT NULL,
        background varchar(16) NOT NULL,
        target varchar(24) NOT NULL,
        target_amount bigint,
        position integer NOT NULL DEFAULT 0,
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by varchar(255),
        CONSTRAINT ck_home_goals_amount CHECK (target_amount IS NULL OR target_amount > 0)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_home_goals_order ON home_goals (position, created_at)',
    );

    await queryRunner.query(
      `INSERT INTO home_goals (texts, illustration, background, target, position, active)
            VALUES ($1::jsonb, 'piggy-bank', 'primary', 'savings_plans', 0, true)`,
      [
        JSON.stringify({
          es: { title: 'Ahorro', subtitle: 'Gana cashback al ahorrar' },
          en: { title: 'Savings', subtitle: 'Earn cashback while you save' },
        }),
      ],
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE home_goals');
    await queryRunner.query('DROP TABLE home_offers');
  }
}
