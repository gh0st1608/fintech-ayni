/**
 * Celular de Yape: 9 dígitos sin el 51. En producción los celulares de Perú empiezan con 9; en el
 * sandbox de Mercado Pago los números de prueba no (p. ej. `111111111` aprueba y `111111113`
 * rechaza por saldo insuficiente), así que ahí basta con 9 dígitos.
 */
export function isValidYapePhone(phoneNumber: string, options: { sandbox: boolean }): boolean {
  return options.sandbox ? /^\d{9}$/.test(phoneNumber) : /^9\d{8}$/.test(phoneNumber);
}
