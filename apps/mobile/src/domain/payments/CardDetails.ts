/**
 * Datos de la tarjeta que escribe el usuario (COPAYNI-40). Solo viven en memoria hasta
 * tokenizarlos con la pasarela: nunca se guardan, se registran ni se envían al backend.
 */
export interface CardDetails {
  number: string;
  holderName: string;
  expirationMonth: number;
  expirationYear: number;
  securityCode: string;
  /** Documento del titular: la pasarela lo pide para tokenizar en Perú. */
  documentNumber: string;
}

/** Los campos del formulario: el vencimiento se escribe junto (MM/AA). */
export type CardField =
  Exclude<keyof CardDetails, 'expirationMonth' | 'expirationYear'> | 'expiration';

/** Solo dígitos: el usuario puede escribir el número con espacios. */
export const digitsOnly = (value: string): string => value.replace(/\D/g, '');

/** Algoritmo de Luhn: detecta errores de tipeo antes de ir a la pasarela. */
export function passesLuhn(number: string): boolean {
  let sum = 0;
  for (let index = 0; index < number.length; index += 1) {
    let digit = Number(number[number.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

/**
 * Campos inválidos de la tarjeta. La pasarela vuelve a validar todo: esto evita viajes con
 * errores de tipeo.
 */
export function invalidCardFields(card: CardDetails, now: Date): CardField[] {
  const invalid: CardField[] = [];
  const number = digitsOnly(card.number);
  if (number.length < 13 || number.length > 19 || !passesLuhn(number)) invalid.push('number');
  if (card.holderName.trim().length < 2) invalid.push('holderName');
  const { expirationMonth: month, expirationYear: year } = card;
  const current = now.getFullYear() * 12 + now.getMonth();
  if (
    !Number.isInteger(month) ||
    !Number.isInteger(year) ||
    month < 1 ||
    month > 12 ||
    year * 12 + (month - 1) < current
  ) {
    invalid.push('expiration');
  }
  if (!/^\d{3,4}$/.test(card.securityCode)) invalid.push('securityCode');
  if (!/^\d{8,12}$/.test(digitsOnly(card.documentNumber))) invalid.push('documentNumber');
  return invalid;
}
