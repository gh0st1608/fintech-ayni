import { Inject, Injectable } from '@nestjs/common';

import { type Principal } from '../../../../shared/application/ports/access-token-verifier.port';
import { type JoinConfig } from '../../domain/entities/join-config';
import {
  JOIN_CONFIG_REPOSITORY,
  type JoinConfigRepositoryPort,
} from '../ports/join-config-repository.port';

/** Montos permitidos para unirse a un Game'ya o al programa de ahorro (COPAYNI-27, 28). */
@Injectable()
export class GetJoinConfigUseCase {
  constructor(
    @Inject(JOIN_CONFIG_REPOSITORY)
    private readonly joinConfigs: JoinConfigRepositoryPort,
  ) {}

  execute(principal: Principal): Promise<JoinConfig> {
    return this.joinConfigs.getForUser(principal.userId);
  }
}
