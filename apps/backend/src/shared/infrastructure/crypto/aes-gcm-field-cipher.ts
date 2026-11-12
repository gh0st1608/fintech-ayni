import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { type FieldCipherPort } from '../../application/ports/field-cipher.port';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const VERSION = 'v1';

/**
 * AES-256-GCM con IV aleatorio por dato: `v1.<iv>.<tag>.<cifrado>` en base64url. GCM autentica el
 * dato, así que uno alterado en la base no se descifra. La clave llega de Secrets Manager en AWS
 * (`FIELD_ENCRYPTION_KEY`); migrar a KMS con cifrado de sobre cambia solo este adaptador.
 */
export class AesGcmFieldCipher implements FieldCipherPort {
  private constructor(private readonly key: Buffer) {}

  /** `key`: 32 bytes en base64. */
  static fromBase64(key: string): AesGcmFieldCipher {
    const bytes = Buffer.from(key, 'base64');
    if (bytes.length !== 32) throw new Error('La clave de cifrado debe tener 32 bytes');
    return new AesGcmFieldCipher(bytes);
  }

  /** Solo desarrollo y pruebas: una clave fija derivada de un texto, para no perder los datos. */
  static forDevelopment(seed: string): AesGcmFieldCipher {
    return new AesGcmFieldCipher(createHash('sha256').update(seed).digest());
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), encrypted]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  decrypt(ciphertext: string): string {
    const [version, iv, tag, encrypted] = ciphertext.split('.');
    if (version !== VERSION || !iv || !tag || encrypted === undefined) {
      throw new Error('Dato cifrado con un formato desconocido');
    }
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
