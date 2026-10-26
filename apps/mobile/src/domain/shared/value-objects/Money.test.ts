import { CurrencyMismatchError, InvalidMoneyError, Money } from './Money';

describe('Money', () => {
  it('usa los decimales propios de cada moneda', () => {
    expect(Money.of(100, 'PEN').fractionDigits).toBe(2);
    expect(Money.of(100, 'JPY').fractionDigits).toBe(0);
  });

  it('rechaza montos que no son enteros en unidades menores', () => {
    expect(() => Money.of(10.5, 'PEN')).toThrow(InvalidMoneyError);
    expect(() => Money.of(Number.NaN, 'PEN')).toThrow(InvalidMoneyError);
  });

  it('rechaza códigos de moneda sin formato ISO 4217', () => {
    expect(() => Money.of(1, 'soles')).toThrow(InvalidMoneyError);
    expect(() => Money.of(1, 'pen')).toThrow(InvalidMoneyError);
  });

  it('convierte desde y hacia unidades mayores sin errores de coma flotante', () => {
    expect(Money.fromMajor(30000, 'PEN').amount).toBe(3_000_000);
    expect(Money.fromMajor(0.1 + 0.2, 'USD').amount).toBe(30);
    expect(Money.of(125_050, 'PEN').toMajor()).toBe(1250.5);
  });

  it('suma solo montos de la misma moneda y no muta los operandos', () => {
    const a = Money.fromMajor(10, 'PEN');
    const total = a.add(Money.fromMajor(2.5, 'PEN'));
    expect(total.equals(Money.fromMajor(12.5, 'PEN'))).toBe(true);
    expect(a.amount).toBe(1000);
    expect(() => a.add(Money.fromMajor(1, 'USD'))).toThrow(CurrencyMismatchError);
  });

  it('se serializa con el contrato del backend', () => {
    expect(JSON.stringify(Money.of(500, 'PEN'))).toBe('{"amount":500,"currency":"PEN"}');
  });

  it('expone un código de error estable', () => {
    expect(() => Money.of(1.5, 'PEN')).toThrow(expect.objectContaining({ code: 'INVALID_MONEY' }));
  });
});
