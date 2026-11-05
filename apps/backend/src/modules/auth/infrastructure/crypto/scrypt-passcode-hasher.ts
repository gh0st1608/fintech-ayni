import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

import { type PasscodeHasherPort } from '../../application/ports/passcode.ports';

const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_BYTES = 32;
const SALT_BYTES = 16;

function derive(passcode: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(passcode, salt, KEY_BYTES, options, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/**
 * scrypt con `node:crypto`, sin dependencias. Guarda el costo junto al hash (`scrypt$N$r$p$sal$hash`)
 * para poder subirlo sin invalidar los passcodes existentes.
 */
export class ScryptPasscodeHasher implements PasscodeHasherPort {
  async hash(passcode: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await derive(passcode, salt, COST);
    const { N, r, p } = COST;
    return ['scrypt', N, r, p, salt.toString('base64url'), key.toString('base64url')].join('$');
  }

  async matches(passcode: string, hash: string): Promise<boolean> {
    const [, N, r, p, salt, expected] = hash.split('$');
    const key = await derive(passcode, Buffer.from(salt!, 'base64url'), {
      N: Number(N),
      r: Number(r),
      p: Number(p),
      maxmem: COST.maxmem,
    });
    return timingSafeEqual(key, Buffer.from(expected!, 'base64url'));
  }
}
