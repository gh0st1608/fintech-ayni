import { z } from 'zod';

import type { PasscodeRepositoryPort } from '@/domain/auth/ports/PasscodeRepositoryPort';
import type { Passcode } from '@/domain/auth/value-objects/Passcode';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';

const statusDto = z.object({ configured: z.boolean() });

/** Adaptador HTTP del passcode (/v1/me/passcode, COPAYNI-23). */
export class PasscodeApiRepository implements PasscodeRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async isConfigured(signal?: AbortSignal): Promise<boolean> {
    const { configured } = await this.http.get('/me/passcode', {
      signal,
      parse: (data) => statusDto.parse(data),
    });
    return configured;
  }

  async save(next: Passcode, current?: Passcode): Promise<void> {
    await this.http.put('/me/passcode', {
      body: { newPasscode: next.value, currentPasscode: current?.value },
    });
  }

  async verify(passcode: Passcode): Promise<void> {
    await this.http.post('/me/passcode/verify', { body: { passcode: passcode.value } });
  }
}
