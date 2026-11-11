import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import type { Money } from '@/domain/shared/value-objects/Money';

export interface FormatMoneyOptions {
  /** Oculta decimales cuando son cero (montos redondos de las tarjetas de círculos). */
  trimZeroDecimals?: boolean;
}

/** Único punto de formato monetario de la app: Intl con el locale recibido. */
export function formatMoney(
  money: Money,
  locale: string,
  options: FormatMoneyOptions = {},
): string {
  const major = money.toMajor();
  const digits = options.trimZeroDecimals && Number.isInteger(major) ? 0 : money.fractionDigits;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: money.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(major);
}

/** Formatea montos con el idioma activo de la app. */
export function useFormatMoney() {
  const { i18n } = useTranslation();
  return useCallback(
    (money: Money, options?: FormatMoneyOptions) => formatMoney(money, i18n.language, options),
    [i18n.language],
  );
}

/**
 * Nombre de la moneda en el idioma activo ("Soles peruanos", "Dólares estadounidenses"), con
 * Intl: los JSON de idioma no llevan códigos de moneda. Si el motor no lo resuelve, el código.
 */
export function currencyName(currency: string, locale: string): string {
  try {
    const name = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'name',
    })
      .formatToParts(2)
      .find((part) => part.type === 'currency')?.value;
    return name ? name.charAt(0).toLocaleUpperCase(locale) + name.slice(1) : currency;
  } catch {
    return currency;
  }
}
