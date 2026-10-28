import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { USER_REPOSITORY } from './application/ports/user-repository.port';
import { UserEntity } from './infrastructure/persistence/typeorm/user.entity';
import { TypeOrmUserRepository } from './infrastructure/persistence/typeorm/typeorm-user.repository';

/** Usuarios y su perfil. Exporta el repositorio para el módulo auth. */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity])],
  providers: [
    TypeOrmUserRepository,
    { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
  ],
  exports: [USER_REPOSITORY],
})
export class UsersModule {}
