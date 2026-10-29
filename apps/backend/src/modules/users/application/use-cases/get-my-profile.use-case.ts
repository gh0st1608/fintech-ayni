import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { type Money } from '../../../../shared/domain/value-objects/money';
import { NotFoundError } from '../../../../shared/errors/app-error';
import { type User } from '../../domain/entities/user';
import { PAY_IN_LIMIT, type PayInLimitPort } from '../ports/pay-in-limit.port';
import { USER_REPOSITORY, type UserRepositoryPort } from '../ports/user-repository.port';

/** Perfil del usuario con su límite mensual de pay-in (COPAYNI-44). */
export interface MyProfile {
  user: User;
  /** `null` si no se le restringe. */
  monthlyPayInLimit: Money | null;
}

/** `GET /v1/me` (COPAYNI-44): el perfil del usuario autenticado. */
@Injectable()
export class GetMyProfileUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepositoryPort,
    @Inject(PAY_IN_LIMIT) private readonly limits: PayInLimitPort,
  ) {}

  async execute(principal: Principal): Promise<MyProfile> {
    const user = await this.users.findById(principal.userId);
    if (!user) throw new NotFoundError('No se encontró el usuario', 'USER_NOT_FOUND');
    return this.profileOf(user);
  }

  async profileOf(user: User): Promise<MyProfile> {
    return { user, monthlyPayInLimit: await this.limits.monthlyLimitFor(user.id) };
  }
}
