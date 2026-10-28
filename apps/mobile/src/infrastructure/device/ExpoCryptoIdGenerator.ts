import { randomUUID } from 'expo-crypto';

import type { IdGeneratorPort } from '@/domain/shared/ports/IdGeneratorPort';

/** UUID v4 con el generador criptográfico del sistema (expo-crypto). */
export class ExpoCryptoIdGenerator implements IdGeneratorPort {
  next(): string {
    return randomUUID();
  }
}
