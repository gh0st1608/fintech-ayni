import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { USER_REPOSITORY } from './application/ports/user-repository.port';
import { UpdatePreferredLanguageUseCase } from './application/use-cases/update-preferred-language.use-case';
import { UserEntity } from './infrastructure/persistence/typeorm/user.entity';
import { TypeOrmUserRepository } from './infrastructure/persistence/typeorm/typeorm-user.repository';
import { MeController } from './presentation/http/controllers/me.controller';

/** Usuarios y su perfil (`/v1/me`). Exporta el repositorio para el módulo auth. */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  controllers: [MeController],
  providers: [
    UpdatePreferredLanguageUseCase,
    TypeOrmUserRepository,
    { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
