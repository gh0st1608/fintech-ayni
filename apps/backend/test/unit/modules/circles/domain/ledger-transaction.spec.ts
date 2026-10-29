import { LedgerTransaction } from '@src/modules/circles/domain/value-objects/ledger-transaction';
import { Money } from '@src/shared/domain/value-objects/money';
import { Period } from '@src/shared/domain/value-objects/period';

const pen = (amount: number) => Money.of(amount, 'PEN');
const invalid = expect.objectContaining({ code: 'INVALID_LEDGER_TRANSACTION' });

describe('LedgerTransaction', () => {
  it('cuadra en una moneda y descarta los asientos en cero', () => {
    const transaction = LedgerTransaction.create({
      key: 'collection:c-1:2026-11',
      kind: 'collection',
      circleId: 'c-1',
      period: Period.of(2026, 11),
      entries: [
        { account: 'external', amount: pen(-1_000) },
        { account: 'circle_pot', amount: pen(1_000) },
        { account: 'operator', amount: pen(0) },
      ],
    });
    expect(transaction.entries).toHaveLength(2);
    expect(transaction.netFor('circle_pot')).toEqual(pen(1_000));
    expect(transaction.netFor('guarantee_fund')).toEqual(pen(0));
    expect(transaction).toMatchObject({ circleId: 'c-1', reason: null });
  });

  it('rechaza movimientos que no cuadran, de varias monedas, sin clave o con un solo asiento', () => {
    const create = (
      entries: { account: 'external' | 'guarantee_fund'; amount: Money }[],
      key = 'k',
    ) => LedgerTransaction.create({ key, kind: 'adjustment', reason: 'corrección', entries });
    expect(() =>
      create([
        { account: 'external', amount: pen(-1) },
        { account: 'guarantee_fund', amount: pen(2) },
      ]),
    ).toThrow(invalid);
    expect(() =>
      create([
        { account: 'external', amount: pen(-1) },
        { account: 'guarantee_fund', amount: Money.of(1, 'USD') },
      ]),
    ).toThrow(invalid);
    expect(() => create([{ account: 'external', amount: pen(1) }])).toThrow(invalid);
    expect(() =>
      create(
        [
          { account: 'external', amount: pen(-1) },
          { account: 'guarantee_fund', amount: pen(1) },
        ],
        ' ',
      ),
    ).toThrow(invalid);
  });

  it('un movimiento manual necesita motivo', () => {
    const transfer = (reason?: string) =>
      LedgerTransaction.transfer({
        key: 'seed_capital:op-1',
        kind: 'seed_capital',
        from: { account: 'external' },
        to: { account: 'guarantee_fund' },
        amount: pen(100),
        reason,
      });
    expect(() => transfer()).toThrow(invalid);
    expect(() => transfer('  ')).toThrow(invalid);
    expect(transfer(' Capital semilla aprobado por el PO ')?.reason).toBe(
      'Capital semilla aprobado por el PO',
    );
  });

  it('transfer no registra un monto cero y un monto negativo invierte el sentido', () => {
    const transfer = (amount: Money) =>
      LedgerTransaction.transfer({
        key: 'k',
        kind: 'coverage',
        from: { account: 'guarantee_fund' },
        to: { account: 'circle_pot' },
        amount,
      });
    expect(transfer(pen(0))).toBeNull();
    expect(transfer(pen(-50))!.netFor('guarantee_fund')).toEqual(pen(50));
  });
});
