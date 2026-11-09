/**
 * Países del selector del teléfono (pending-scope D14). Lista provisional: Perú y la región, más
 * Estados Unidos y España. El nombre visible sale de los JSON de idioma (`countries.<región>`).
 */
export const COUNTRIES = [
  { regionCode: 'PE', callingCode: '+51' },
  { regionCode: 'AR', callingCode: '+54' },
  { regionCode: 'BO', callingCode: '+591' },
  { regionCode: 'BR', callingCode: '+55' },
  { regionCode: 'CL', callingCode: '+56' },
  { regionCode: 'CO', callingCode: '+57' },
  { regionCode: 'EC', callingCode: '+593' },
  { regionCode: 'MX', callingCode: '+52' },
  { regionCode: 'PY', callingCode: '+595' },
  { regionCode: 'UY', callingCode: '+598' },
  { regionCode: 'VE', callingCode: '+58' },
  { regionCode: 'US', callingCode: '+1' },
  { regionCode: 'ES', callingCode: '+34' },
] as const;

export type Country = (typeof COUNTRIES)[number];
export type RegionCode = Country['regionCode'];

/** Ayni opera en Perú: es el país si el del dispositivo no está en la lista. */
export const DEFAULT_REGION: RegionCode = 'PE';

const SEPARATORS = /[\s().-]/g;

export function countryFor(regionCode: string | null | undefined): Country | null {
  const code = regionCode?.trim().toUpperCase();
  return COUNTRIES.find((country) => country.regionCode === code) ?? null;
}

/**
 * Un número local: solo dígitos y separadores, sin `+` ni `@`. Lo que empieza con `+` ya trae su
 * código de país; con `@` es un email.
 */
export function looksLikeLocalPhone(raw: string): boolean {
  const value = raw.trim();
  return /^[\d\s().-]+$/.test(value) && value.replace(SEPARATORS, '').length >= 6;
}

/**
 * El número local en formato internacional, p. ej. "987 654 321" en Perú → "+51987654321". Quita
 * el 0 de larga distancia nacional que algunos escriben delante (p. ej. "011…" en Argentina).
 */
export function toInternational(country: Country, local: string): string {
  const digits = local.replace(SEPARATORS, '').replace(/^0+/, '');
  return `${country.callingCode}${digits}`;
}
