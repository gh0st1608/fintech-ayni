import { Module } from '@nestjs/common';

import { JOIN_CONFIG_REPOSITORY } from './application/ports/join-config-repository.port';
import { GetJoinConfigUseCase } from './application/use-cases/get-join-config.use-case';
import { ConfigJoinConfigRepository } from './infrastructure/persistence/config-join-config.repository';
import { CirclesController } from './presentation/http/controllers/circles.controller';

@Module({
  controllers: [CirclesController],
  providers: [
    GetJoinConfigUseCase,
    ConfigJoinConfigRepository,
    { provide: JOIN_CONFIG_REPOSITORY, useExisting: ConfigJoinConfigRepository },
  ],
})
export class CirclesModule {}
