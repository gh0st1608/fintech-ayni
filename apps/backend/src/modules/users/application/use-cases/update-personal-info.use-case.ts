import { Inject, Injectable, Logger } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { NotFoundError } from '../../../../shared/errors/app-error';
import { type User } from '../../domain/entities/user';
import { USER_REPOSITORY, type UserRepositoryPort } from '../ports/user-repository.port';

export interface PersonalInfoChanges {
  firstName?: string;
  lastName?: string;
  preferredLanguage?: string;
}

/**
 * `PATCH /v1/me` (COPAYNI-45 y 50): nombre, apellido e idioma. Un campo ausente no cambia. El
 * email y el teléfono se cambian verificando un OTP (`/v1/me/contact`, supuesto R9). La auditoría
 * registra qué campos cambiaron, nunca sus valores.
 */
@Injectable()
export class UpdatePersonalInfoUseCase {
  private readonly logger = new Logger('Users');

  constructor(@Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort) {}

  async execute(principal: Principal, changes: PersonalInfoChanges): Promise<User> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new NotFoundError('No se encontró el usuario', 'USER_NOT_FOUND');
    user.changeName(changes);
    if (changes.preferredLanguage !== undefined) {
      user.changePreferredLanguage(changes.preferredLanguage);
    }
    await this.users.save(user);
    this.logger.log({
      event: 'users.profile_updated',
      userId: user.id,
      fields: Object.keys(changes).filter(
        (key) => changes[key as keyof PersonalInfoChanges] !== undefined,
      ),
    });
    return user;
  }
}
