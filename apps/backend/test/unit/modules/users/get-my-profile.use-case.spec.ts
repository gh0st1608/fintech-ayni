import { type AppConfigService } from '@src/config/configuration';
import { KycPayInLimit } from '@src/modules/documents/application/kyc-pay-in-limit';
import { type KycStatusPort } from '@src/modules/documents/application/ports';
import { type UserRepositoryPort } from '@src/modules/users/application/ports/user-repository.port';
import { GetMyProfileUseCase } from '@src/modules/users/application/use-cases/get-my-profile.use-case';
import { User } from '@src/modules/users/domain/entities/user';
import { MeResponse } from '@src/modules/users/presentation/http/dto/me.dto';
import { Money } from '@src/shared/domain/value-objects/money';

const ANA = User.restore({
  id: 'u-1',
  email: 'ana@mail.com',
  phone: null,
  status: 'active',
  preferredLanguage: 'es',
});

const NO_KYC: KycStatusPort = {
  identityVerified: () => Promise.resolve(false),
  approvedMonthlyIncome: () => Promise.resolve(null),
};
const limitFrom = (amount: number) =>
  new KycPayInLimit(
    {
      get: (key: string) =>
        ({ JOIN_MONTHLY_PAYIN_LIMIT: amount, PAYIN_LIMIT_INCOME_SHARE_BPS: 3000 })[key] ?? 'PEN',
    } as unknown as AppConfigService,
    NO_KYC,
  );

function useCase(user: User | null, amount = 0) {
  const users: UserRepositoryPort = {
    findById: () => Promise.resolve(user),
    findOrRegister: jest.fn(),
    findByIdentifier: jest.fn(),
    save: jest.fn(),
  };
  return new GetMyProfileUseCase(users, limitFrom(amount));
}

describe('GetMyProfileUseCase (COPAYNI-44)', () => {
  it('devuelve el perfil con el límite mensual configurado', async () => {
    const profile = await useCase(ANA, 500_000).execute({ userId: 'u-1' });
    expect(profile.monthlyPayInLimit).toEqual(Money.of(500_000, 'PEN'));
    expect(MeResponse.from(profile)).toEqual({
      id: 'u-1',
      email: 'ana@mail.com',
      phone: null,
      status: 'active',
      preferredLanguage: 'es',
      firstName: null,
      lastName: null,
      fullName: null,
      monthlyPayInLimit: { amount: 500_000, currency: 'PEN' },
    });
  });

  it('sin límite configurado no lo restringe', async () => {
    const profile = await useCase(ANA).execute({ userId: 'u-1' });
    expect(MeResponse.from(profile).monthlyPayInLimit).toBeNull();
  });

  it('un usuario que ya no existe responde USER_NOT_FOUND', async () => {
    await expect(useCase(null).execute({ userId: 'u-1' })).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
    });
  });
});
