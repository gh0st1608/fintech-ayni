/**
 * Palabras de un nombre para compararlo con otra fuente (RENIEC, el titular de una cuenta): sin
 * tildes, en mayúsculas y solo letras. "José-Luis  Pérez" → ["JOSE", "LUIS", "PEREZ"].
 */
export function nameTokens(value: string): string[] {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Todas las palabras de `needles` están en `haystack` (y hay al menos una). */
export const containsAllTokens = (haystack: string[], needles: string[]): boolean =>
  needles.length > 0 && needles.every((needle) => haystack.includes(needle));
