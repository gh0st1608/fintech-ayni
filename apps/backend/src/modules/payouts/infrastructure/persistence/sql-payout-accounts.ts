import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { type DataSource } from 'typeorm';

import { ConflictError } from '../../../../shared/errors/app-error';
import {
  type NewPayoutAccount,
  type PayoutAccountOwner,
  type PayoutAccountOwnerPort,
  type PayoutAccountRepositoryPort,
} from '../../application/ports/payout.ports';
import { type PayoutAccount } from '../../domain/payout-account';

interface AccountRow {
  id: string;
  user_id: string;
  kind: PayoutAccount['kind'];
  bank_code: PayoutAccount['bankCode'];
  account_type: PayoutAccount['accountType'];
  wallet_provider: PayoutAccount['walletProvider'];
  number_last4: string;
  holder_name: string;
  registered_by: string;
  registered_by_email: string | null;
  created_at: Date;
  replaced_at: Date | null;
}

/** El número cifrado nunca se lee aquí: solo lo necesitará el riel de payouts (T5). */
const COLUMNS = `id, user_id, kind, bank_code, account_type, wallet_provider, number_last4,
  holder_name, registered_by, registered_by_email, created_at, replaced_at`;

const toAccount = (row: AccountRow): PayoutAccount => ({
  id: row.id,
  userId: row.user_id,
  kind: row.kind,
  bankCode: row.bank_code,
  accountType: row.account_type,
  walletProvider: row.wallet_provider,
  last4: row.number_last4,
  holderName: row.holder_name,
  registeredBy: row.registered_by,
  registeredByEmail: row.registered_by_email,
  createdAt: new Date(row.created_at),
  replacedAt: row.replaced_at ? new Date(row.replaced_at) : null,
});

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '23505';

@Injectable()
export class SqlPayoutAccountRepository implements PayoutAccountRepositoryPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async current(userId: string): Promise<PayoutAccount | null> {
    const rows = await this.dataSource.query<AccountRow[]>(
      `SELECT ${COLUMNS} FROM payout_accounts WHERE user_id = $1 AND replaced_at IS NULL`,
      [userId],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async history(userId: string): Promise<PayoutAccount[]> {
    const rows = await this.dataSource.query<AccountRow[]>(
      `SELECT ${COLUMNS} FROM payout_accounts WHERE user_id = $1
        ORDER BY created_at DESC, id DESC LIMIT 50`,
      [userId],
    );
    return rows.map(toAccount);
  }

  async register(account: NewPayoutAccount): Promise<PayoutAccount> {
    try {
      return await this.dataSource.transaction(async (manager) => {
        await manager.query(
          `UPDATE payout_accounts SET replaced_at = $2 WHERE user_id = $1 AND replaced_at IS NULL`,
          [account.userId, account.at],
        );
        const rows = await manager.query<AccountRow[]>(
          `INSERT INTO payout_accounts (id, user_id, kind, bank_code, account_type, wallet_provider,
             number_encrypted, number_last4, holder_name, registered_by, registered_by_email,
             reason, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
           RETURNING ${COLUMNS}`,
          [
            account.id,
            account.userId,
            account.kind,
            account.bankCode,
            account.accountType,
            account.walletProvider,
            account.encryptedNumber,
            account.last4,
            account.holderName,
            account.registeredBy,
            account.registeredByEmail,
            account.reason,
            account.at,
          ],
        );
        await manager.query(
          `INSERT INTO user_payout_methods (user_id, method) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE SET method = EXCLUDED.method, updated_at = now()`,
          [account.userId, account.method],
        );
        return toAccount(rows[0]!);
      });
    } catch (error) {
      // Dos registros a la vez para la misma persona: gana el primero.
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'PAYOUT_ACCOUNT_CONFLICT',
          'Otra persona del equipo registró una cuenta al mismo tiempo. Vuelve a cargar',
        );
      }
      throw error;
    }
  }
}

/** Nombre del perfil y si la identidad está verificada (DNI aprobado o VerificaID aprobado). */
@Injectable()
export class SqlPayoutAccountOwners implements PayoutAccountOwnerPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async find(userId: string): Promise<PayoutAccountOwner | null> {
    const rows = await this.dataSource.query<
      { first_name: string | null; last_name: string | null; identity_verified: boolean }[]
    >(
      `SELECT u.first_name, u.last_name,
              EXISTS (SELECT 1 FROM kyc_documents d
                       WHERE d.user_id = u.id AND d.type = 'national_id' AND d.status = 'approved')
              OR EXISTS (SELECT 1 FROM identity_verifications v
                          WHERE v.user_id = u.id AND v.status = 'approved') AS identity_verified
         FROM users u WHERE u.id = $1`,
      [userId],
    );
    const row = rows[0];
    return row
      ? {
          firstName: row.first_name,
          lastName: row.last_name,
          identityVerified: row.identity_verified,
        }
      : null;
  }
}
