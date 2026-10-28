import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { NotFoundError } from '../../../../shared/errors/app-error';
import { type User } from '../../domain/entities/user';
import { USER_REPOSITORY, type UserRepositoryPort } from '../ports/user-repository.port';

/**
 * `PATCH /v1/me` (COPAYNI-50): guarda el idioma elegido en la app. El formato lo valida el DTO;
 * qué idiomas existen lo decide el catálogo de la app, no el backend.
 */
@Injectable()
export class UpdatePreferredLanguageUseCase {
  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort) {}

  async execute(principal: Principal, preferredLanguage: string): Promise<User> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new NotFoundError('No se encontró el usuario', 'USER_NOT_FOUND');
    user.changePreferredLanguage(preferredLanguage);
    await this.users.save(user);
    return user;
  }
}
