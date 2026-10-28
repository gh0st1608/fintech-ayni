import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CIRCLE_REPOSITORY } from './application/ports/circle-repository.port';
import { JOIN_CONFIG_REPOSITORY } from './application/ports/join-config-repository.port';
import { GetInstallmentOptionsUseCase } from './application/use-cases/get-installment-options.use-case';
import { GetJoinConfigUseCase } from './application/use-cases/get-join-config.use-case';
import { ConfigJoinConfigRepository } from './infrastructure/persistence/config-join-config.repository';
import { CircleMembershipEntity } from './infrastructure/persistence/typeorm/circle-membership.entity';
import { CircleEntity } from './infrastructure/persistence/typeorm/circle.entity';
import { TypeOrmCircleRepository } from './infrastructure/persistence/typeorm/typeorm-circle.repository';
import { CirclesController } from './presentation/http/controllers/circles.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CircleEntity, CircleMembershipEntity])],
  controllers: [CirclesController],
  providers: [
    GetJoinConfigUseCase,
    GetInstallmentOptionsUseCase,
    ConfigJoinConfigRepository,
    { provide: JOIN_CONFIG_REPOSITORY, useExisting: ConfigJoinConfigRepository },
    TypeOrmCircleRepository,
    { provide: CIRCLE_REPOSITORY, useExisting: TypeOrmCircleRepository },
  ],
})
export class CirclesModule {}
