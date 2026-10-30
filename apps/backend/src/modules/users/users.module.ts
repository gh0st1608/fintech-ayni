import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PAY_IN_LIMIT } from './application/ports/pay-in-limit.port';
import { USER_REPOSITORY } from './application/ports/user-repository.port';
import { GetMyProfileUseCase } from './application/use-cases/get-my-profile.use-case';
import { UpdatePersonalInfoUseCase } from './application/use-cases/update-personal-info.use-case';
import { ConfigPayInLimit } from './infrastructure/config-pay-in-limit';
import { UserEntity } from './infrastructure/persistence/typeorm/user.entity';
import { TypeOrmUserRepository } from './infrastructure/persistence/typeorm/typeorm-user.repository';
import { MeController } from './presentation/http/controllers/me.controller';

/** Usuarios y su perfil (`/v1/me`). Exporta el repositorio para el módulo auth. */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [MeController],
  providers: [
    UpdatePersonalInfoUseCase,
    GetMyProfileUseCase,
    { provide: PAY_IN_LIMIT, useClass: ConfigPayInLimit },
    TypeOrmUserRepository,
    { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
  ],
  exports: [USER_REPOSITORY, GetMyProfileUseCase],
})
export class UsersModule {}
