import { Money } from '@/domain/shared/value-objects/Money';

import { assertSavingQuote, InvalidSavingQuoteError, type SavingQuote } from './SavingPlan';

const pen = (amount: number) => Money.of(amount, 'PEN');

const quote = (overrides: Partial<SavingQuote> = {}): SavingQuote => ({
  planId: 'lite',
  months: 2,
  monthlyInstallment: pen(150001),
  installments: [pen(150001), pen(150000)],
  target: pen(300001),
  cashback: pen(15000),
  total: pen(315001),
  startsOn: '2026-12',
  payoutPeriod: '2027-02',
  ...overrides,
});

describe('assertSavingQuote', () => {
  it('acepta una cotización coherente, con cuotas desiguales por un céntimo', () => {
    const valid = quote();
    expect(assertSavingQuote(valid)).toBe(valid);
  });

  it.each<[string, Partial<SavingQuote>]>([
    // El error del Figma: Apr 2024 < Nov 2024.
    ['un payout anterior al inicio', { startsOn: '2024-11', payoutPeriod: '2024-04' }],
    ['un payout en el mismo mes del inicio', { payoutPeriod: '2026-12' }],
    ['un periodo mal formado', { startsOn: '2026-13' }],
    ['menos cuotas que meses', { installments: [pen(300001)] }],
    ['cuotas que no suman el objetivo', { installments: [pen(150000), pen(150000)] }],
    ['un total sin el cashback', { total: pen(300001) }],
    ['otra moneda', { cashback: Money.of(15000, 'USD') }],
  ])('rechaza %s', (_case, overrides) => {
    expect(() => assertSavingQuote(quote(overrides))).toThrow(InvalidSavingQuoteError);
  });
});
