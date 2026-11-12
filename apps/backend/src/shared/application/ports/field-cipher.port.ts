export const FIELD_CIPHER = Symbol('FIELD_CIPHER');

/**
 * Cifrado de un dato sensible antes de guardarlo (p. ej. el CCI de una cuenta de cobro). El texto
 * cifrado lleva la versión de la clave para poder rotarla.
 */
export interface FieldCipherPort {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}
