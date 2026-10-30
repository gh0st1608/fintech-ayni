import { z } from 'zod';

import type { AuthChallenge } from '@/domain/auth/AuthChallenge';
import type { LoginIdentifier } from '@/domain/auth/value-objects/LoginIdentifier';
import type { OtpCode } from '@/domain/auth/value-objects/OtpCode';
import type { UserProfileRepositoryPort } from '@/domain/profile/ports/UserProfileRepositoryPort';
import type { UserProfile } from '@/domain/profile/UserProfile';
import type { HttpClientPort } from '@/domain/shared/ports/HttpClientPort';
import { challengeDto, toChallenge, toOtpRejection } from '@/infrastructure/auth/AuthApiRepository';
import { moneyDto, toMoney } from '@/infrastructure/circles/moneyDto';

/** DTO del modelo Me (docs/api/me.md). */
const meDto = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  preferredLanguage: z.string().nullable(),
  firstName: z.string().nullable(),
  lastName: z.string().nullable(),
  fullName: z.string().nullable(),
  monthlyPayInLimit: moneyDto.nullable(),
});

const toProfile = (dto: z.infer<typeof meDto>): UserProfile => ({
  ...dto,
  monthlyPayInLimit: dto.monthlyPayInLimit && toMoney(dto.monthlyPayInLimit),
});

/** Adaptador HTTP del perfil (/v1/me, COPAYNI-44, 45 y 50). */
export class UserProfileApiRepository implements UserProfileRepositoryPort {
  constructor(private readonly http: HttpClientPort) {}

  async getProfile(signal?: AbortSignal): Promise<UserProfile> {
    return toProfile(await this.http.get('/me', { signal, parse: (data) => meDto.parse(data) }));
  }

  async updatePreferredLanguage(languageCode: string): Promise<void> {
    await this.http.patch('/me', { body: { preferredLanguage: languageCode } });
  }

  async updatePersonalInfo(info: { firstName: string; lastName: string }): Promise<UserProfile> {
    return toProfile(
      await this.http.patch('/me', { body: info, parse: (data) => meDto.parse(data) }),
    );
  }

  async startContactChange(identifier: LoginIdentifier): Promise<AuthChallenge> {
    const dto = await this.http.post('/me/contact/start', {
      body: { identifier: identifier.value, type: identifier.kind },
      parse: (data) => challengeDto.parse(data),
    });
    return toChallenge(dto);
  }

  async verifyContactChange(challengeId: string, code: OtpCode): Promise<UserProfile> {
    try {
      return toProfile(
        await this.http.post('/me/contact/verify', {
          body: { challengeId, code: code.value },
          parse: (data) => meDto.parse(data),
        }),
      );
    } catch (error) {
      throw toOtpRejection(error);
    }
  }
}
