import { type EntityManager } from 'typeorm';

import { Money } from '../../../../../shared/domain/value-objects/money';
import { type LedgerTransaction } from '../../../domain/value-objects/ledger-transaction';

/** Bloqueo del fondo: dos transacciones no pueden gastar el mismo saldo. */
export const lockFund = (manager: EntityManager): Promise<unknown> =>
  manager.query("SELECT pg_advisory_xact_lock(hashtextextended('guarantee_fund', 0))");

export async function fundBalance(manager: EntityManager, currency: string): Promise<Money> {
  const [row] = await manager.query<{ balance: string }[]>(
    `SELECT COALESCE(sum(amount), 0)::text AS balance
       FROM ledger_entries WHERE account = 'guarantee_fund' AND currency = $1`,
    [currency],
  );
  return Money.of(Number(row?.balance ?? 0), currency);
}

/**
 * Inserta el movimiento y sus asientos; `false` si ya existía uno con esa clave. Debe correr dentro
 * de una transacción: el cuadre se verifica al confirmarla (trigger diferido).
 */
export async function insertLedgerTransaction(
  manager: EntityManager,
  transaction: LedgerTransaction,
): Promise<boolean> {
  const inserted = await manager.query<{ key: string }[]>(
    `INSERT INTO ledger_transactions (key, kind, circle_id, period, reason)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO NOTHING
     RETURNING key`,
    [
      transaction.key,
      transaction.kind,
      transaction.circleId,
      transaction.period ? `${transaction.period.toString()}-01` : null,
      transaction.reason,
    ],
  );
  if (inserted.length === 0) return false;
  for (const entry of transaction.entries) {
    await manager.query(
      `INSERT INTO ledger_entries (transaction_key, account, user_id, amount, currency)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        transaction.key,
        entry.account,
        entry.userId ?? null,
        entry.amount.amount,
        entry.amount.currency,
      ],
    );
  }
  return true;
}
