import { type MigrationInterface, type QueryRunner } from 'typeorm';

const ACCOUNTS = [
  'circle_pot',
  'guarantee_fund',
  'operator',
  'member_payable',
  'refunds_payable',
  'external',
];
const KINDS = [
  'collection',
  'coverage',
  'payout',
  'operator_residual',
  'fund_contribution',
  'pot_returned',
  'fund_debt_to_member',
  'refund_due',
  'penalty',
  'refund_paid',
  'debt_recovered',
  'seed_capital',
  'adjustment',
];
const list = (values: string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * Fondo de garantía (COPAYNI-58): registro contable de doble entrada. La base de datos impone lo
 * que el dominio ya valida:
 * - Solo inserción: ningún movimiento se edita ni se borra; una corrección es otro movimiento.
 * - Cada movimiento cuadra al terminar la transacción: al menos dos asientos, una moneda, suma
 *   cero.
 * - Un movimiento por clave: repetir un período no duplica nada.
 *
 * También guarda en cada expulsión lo pagado (para la penalidad) y cuándo se pagó la devolución.
 */
export class CreateGuaranteeFund1762257600000 implements MigrationInterface {
  name = 'CreateGuaranteeFund1762257600000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ledger_transactions (
        key varchar(200) PRIMARY KEY,
        kind varchar(32) NOT NULL CHECK (kind IN (${list(KINDS)})),
        circle_id uuid REFERENCES circles (id) ON DELETE RESTRICT,
        period date CHECK (extract(day FROM period) = 1),
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT ck_ledger_transactions_manual_reason
          CHECK (kind NOT IN ('seed_capital', 'adjustment') OR reason IS NOT NULL)
      )
    `);
    await queryRunner.query(`
      CREATE TABLE ledger_entries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_key varchar(200) NOT NULL
          REFERENCES ledger_transactions (key) ON DELETE RESTRICT,
        account varchar(32) NOT NULL CHECK (account IN (${list(ACCOUNTS)})),
        user_id uuid REFERENCES users (id) ON DELETE RESTRICT,
        amount bigint NOT NULL CHECK (amount <> 0),
        currency char(3) NOT NULL CHECK (currency ~ '^[A-Z]{3}$')
      )
    `);
    await queryRunner.query(
      'CREATE INDEX ix_ledger_entries_transaction ON ledger_entries (transaction_key)',
    );
    await queryRunner.query(
      'CREATE INDEX ix_ledger_entries_account ON ledger_entries (account, currency)',
    );

    await queryRunner.query(`
      CREATE FUNCTION ledger_reject_change() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'El registro contable es solo de inserción (%)', TG_TABLE_NAME;
      END $$
    `);
    for (const table of ['ledger_transactions', 'ledger_entries']) {
      await queryRunner.query(`
        CREATE TRIGGER tr_${table}_immutable BEFORE UPDATE OR DELETE ON ${table}
          FOR EACH ROW EXECUTE FUNCTION ledger_reject_change()
      `);
      await queryRunner.query(`
        CREATE TRIGGER tr_${table}_no_truncate BEFORE TRUNCATE ON ${table}
          FOR EACH STATEMENT EXECUTE FUNCTION ledger_reject_change()
      `);
    }

    // TG_ARGV[0]: la columna de la fila con la clave del movimiento.
    await queryRunner.query(`
      CREATE FUNCTION ledger_check_balanced() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE
        tx_key varchar := to_jsonb(NEW) ->> TG_ARGV[0];
      BEGIN
        IF (SELECT count(*) < 2 OR count(DISTINCT currency) <> 1 OR sum(amount) <> 0
              FROM ledger_entries WHERE transaction_key = tx_key) THEN
          RAISE EXCEPTION 'El movimiento % no cuadra', tx_key;
        END IF;
        RETURN NULL;
      END $$
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER tr_ledger_transactions_balanced
        AFTER INSERT ON ledger_transactions DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced('key')
    `);
    await queryRunner.query(`
      CREATE CONSTRAINT TRIGGER tr_ledger_entries_balanced
        AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION ledger_check_balanced('transaction_key')
    `);

    await queryRunner.query(`
      ALTER TABLE circle_expulsions
        ADD COLUMN paid_amount bigint CHECK (paid_amount >= 0),
        ADD COLUMN refunded_at timestamptz
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE circle_expulsions DROP COLUMN refunded_at, DROP COLUMN paid_amount',
    );
    await queryRunner.query('DROP TABLE ledger_entries');
    await queryRunner.query('DROP TABLE ledger_transactions');
    await queryRunner.query('DROP FUNCTION ledger_check_balanced()');
    await queryRunner.query('DROP FUNCTION ledger_reject_change()');
  }
}
