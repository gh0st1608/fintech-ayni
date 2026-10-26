import { act, renderHook } from '@testing-library/react-native';
import { I18nextProvider } from 'react-i18next';

import { Money } from '@/domain/shared/value-objects/Money';
import { createI18n } from '@/presentation/i18n/createI18n';

import { formatDate, useFormatDate } from './formatDate';
import { formatMoney, useFormatMoney } from './formatMoney';

const normalize = (value: string) => value.replace(/\s/g, ' ');
const NOV_2024 = new Date(2024, 10, 15, 12, 0);

async function renderWithI18n<T>(hook: () => T) {
  const i18n = await createI18n('es', 'es');
  const rendered = await renderHook(hook, {
    wrapper: ({ children }) => <I18nextProvider i18n={i18n}>{children}</I18nextProvider>,
  });
  return { ...rendered, i18n };
}

describe('formatMoney', () => {
  it('formatea en unidades mayores con la moneda y el locale recibidos', () => {
    expect(normalize(formatMoney(Money.of(125_050, 'USD'), 'en-US'))).toBe('$1,250.50');
    expect(normalize(formatMoney(Money.of(125_050, 'PEN'), 'en-US'))).toBe('PEN 1,250.50');
  });

  it('respeta los decimales de la moneda', () => {
    expect(normalize(formatMoney(Money.of(1500, 'JPY'), 'en-US'))).toBe('¥1,500');
  });

  it('puede ocultar decimales cero en montos redondos', () => {
    const options = { trimZeroDecimals: true };
    expect(formatMoney(Money.fromMajor(30000, 'USD'), 'en-US', options)).toBe('$30,000');
    expect(formatMoney(Money.fromMajor(30000.5, 'USD'), 'en-US', options)).toBe('$30,000.50');
  });

  it('useFormatMoney sigue el idioma activo', async () => {
    const { result, i18n } = await renderWithI18n(() => useFormatMoney());
    const amount = Money.of(125_050, 'USD');
    const inSpanish = result.current(amount);
    expect(inSpanish).toBe(formatMoney(amount, 'es'));

    await act(() => i18n.changeLanguage('en'));
    expect(result.current(amount)).toBe('$1,250.50');
  });
});

describe('formatDate', () => {
  it('formatea según el locale y acepta fechas ISO del backend', () => {
    expect(formatDate(NOV_2024, 'en-US', 'month')).toBe('November');
    expect(formatDate(NOV_2024, 'es', 'month')).toBe('noviembre');
    expect(formatDate('2024-11-15T12:00:00', 'en-US', 'month')).toBe('November');
  });

  it('useFormatDate sigue el idioma activo', async () => {
    const { result, i18n } = await renderWithI18n(() => useFormatDate());
    expect(result.current(NOV_2024, 'month')).toBe('noviembre');
    await act(() => i18n.changeLanguage('en'));
    expect(result.current(NOV_2024, 'month')).toBe('November');
  });
});
