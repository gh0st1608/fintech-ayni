import { type AppConfigService } from '@src/config/configuration';
import { type UserRepositoryPort } from '@src/modules/users/application/ports/user-repository.port';
import { GetMyProfileUseCase } from '@src/modules/users/application/use-cases/get-my-profile.use-case';
import { User } from '@src/modules/users/domain/entities/user';
import { ConfigPayInLimit } from '@src/modules/users/infrastructure/config-pay-in-limit';
import { MeResponse } from '@src/modules/users/presentation/http/dto/me.dto';
import { Money } from '@src/shared/domain/value-objects/money';

const ANA = User.restore({
  id: 'u-1',
  email: 'ana@mail.com',
  phone: null,
  status: 'active',
  preferredLanguage: 'es',
});

const limitFrom = (amount: number) =>
  new ConfigPayInLimit({
    get: (key: string) => (key === 'JOIN_MONTHLY_PAYIN_LIMIT' ? amount : 'PEN'),
  } as unknown as AppConfigService);

function useCase(user: User | null, amount = 0) {
  const users: UserRepositoryPort = {
    findById: () => Promise.resolve(user),
    findOrRegister: jest.fn(),
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
