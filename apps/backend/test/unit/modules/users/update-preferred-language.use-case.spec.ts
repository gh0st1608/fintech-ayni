import { type UserRepositoryPort } from '@src/modules/users/application/ports/user-repository.port';
import { UpdatePreferredLanguageUseCase } from '@src/modules/users/application/use-cases/update-preferred-language.use-case';

describe('UpdatePreferredLanguageUseCase', () => {
  it('un usuario que ya no existe responde USER_NOT_FOUND', async () => {
    const users: UserRepositoryPort = {
      findById: () => Promise.resolve(null),
      findOrRegister: jest.fn(),
      save: jest.fn(),
    };
    await expect(
      new UpdatePreferredLanguageUseCase(users).execute({ userId: 'u-1' }, 'en'),
    ).rejects.toMatchObject({ code: 'USER_NOT_FOUND', kind: 'not_found' });
    expect(users.save).not.toHaveBeenCalled();
  });
});
