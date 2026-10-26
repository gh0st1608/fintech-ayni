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
