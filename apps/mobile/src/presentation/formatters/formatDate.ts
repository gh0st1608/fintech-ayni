import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

/** Formatos del Figma: tarjetas ("Nov, 2024"), mes suelto e historial (fecha y hora). */
const PRESETS = {
  monthYear: { month: 'short', year: 'numeric' },
  month: { month: 'long' },
  dateTime: {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: 'numeric',
    minute: '2-digit',
  },
} as const satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DatePreset = keyof typeof PRESETS;

export function formatDate(date: Date | string, locale: string, preset: DatePreset): string {
  return new Intl.DateTimeFormat(locale, PRESETS[preset]).format(new Date(date));
}

/** Formatea fechas con el idioma activo de la app. */
export function useFormatDate() {
  const { i18n } = useTranslation();
  return useCallback(
    (date: Date | string, preset: DatePreset) => formatDate(date, i18n.language, preset),
    [i18n.language],
  );
}
