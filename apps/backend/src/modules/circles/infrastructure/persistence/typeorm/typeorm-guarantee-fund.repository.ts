import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { type Repository } from 'typeorm';

import { Money } from '../../../../../shared/domain/value-objects/money';
import {
  type FundStatus,
  type GuaranteeFundPort,
} from '../../../application/ports/guarantee-fund.port';
import { type LedgerTransaction } from '../../../domain/value-objects/ledger-transaction';
import { CircleEntity } from './circle.entity';
import { insertLedgerTransaction, lockFund } from './ledger.sql';

/** GuaranteeFundPort sobre `ledger_entries` (COPAYNI-58). */
@Injectable()
export class TypeOrmGuaranteeFund implements GuaranteeFundPort {
  constructor(@InjectRepository(CircleEntity) private readonly circles: Repository<CircleEntity>) {}

  async status(): Promise<FundStatus[]> {
    // La cuota base es la primera parte de `Money.allocate`: el payout entre los meses, hacia arriba.
    const rows = await this.circles.query<
      { currency: string; balance: string; circles: number; base: string }[]
    >(`
      WITH balances AS (
        SELECT currency, sum(amount) AS balance
          FROM ledger_entries WHERE account = 'guarantee_fund' GROUP BY currency
      ), active AS (
        SELECT currency, count(*) AS circles, sum(ceil(payout_amount::numeric / months)) AS base
          FROM circles WHERE cycle_state = 'contributing' GROUP BY currency
      )
      SELECT COALESCE(b.currency, a.currency) AS currency,
             COALESCE(b.balance, 0)::text AS balance,
             COALESCE(a.circles, 0)::int AS circles,
             COALESCE(a.base, 0)::text AS base
        FROM balances b FULL JOIN active a ON a.currency = b.currency
       ORDER BY 1
    `);
    return rows.map(({ currency, balance, circles, base }) => ({
      balance: Money.of(Number(balance), currency),
      activeCircles: circles,
      activeBaseInstallments: Money.of(Number(base), currency),
    }));
  }

  record(transaction: LedgerTransaction): Promise<boolean> {
    return this.circles.manager.transaction(async (manager) => {
      await lockFund(manager);
      return insertLedgerTransaction(manager, transaction);
    });
  }
}
