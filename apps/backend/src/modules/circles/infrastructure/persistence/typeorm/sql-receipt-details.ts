import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  type BankCode,
  maskedLabel,
  type PayoutAccountKind,
  type WalletProvider,
} from '../../../../payouts/domain/payout-account';
import { type TransactionDetail } from '../../../application/ports/payments-query.port';
import { type ReceiptDetailsPort } from '../../../application/use-cases/transaction-receipt.use-case';

/**
 * Lectura para el comprobante: el método registrado al cobrar la cuota (pagos) o la cuenta de
 * cobro vigente cuando se pagó el pozo (cobros). Solo etiquetas enmascaradas.
 */
@Injectable()
export class SqlReceiptDetails implements ReceiptDetailsPort {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async methodOf(userId: string, detail: TransactionDetail): Promise<string | null> {
    if (detail.kind === 'installment') {
      const rows = await this.dataSource.query<{ label: string }[]>(
        `SELECT m.label FROM installment_payment_methods m
           JOIN circle_installments i ON i.id = m.installment_id
          WHERE m.installment_id::text = $1 AND i.user_id = $2`,
        [detail.id, userId],
      );
      return rows[0]?.label ?? null;
    }
    if (detail.type !== 'payout') return null;
    const rows = await this.dataSource.query<
      {
        kind: PayoutAccountKind;
        bank_code: BankCode | null;
        wallet_provider: WalletProvider | null;
        number_last4: string;
      }[]
    >(
      `SELECT kind, bank_code, wallet_provider, number_last4 FROM payout_accounts
        WHERE user_id = $1 AND created_at <= $2 AND (replaced_at IS NULL OR replaced_at > $2)
        ORDER BY created_at DESC LIMIT 1`,
      [userId, detail.occurredAt],
    );
    const account = rows[0];
    return account
      ? maskedLabel({
          kind: account.kind,
          bankCode: account.bank_code,
          walletProvider: account.wallet_provider,
          last4: account.number_last4,
        })
      : null;
  }
}
