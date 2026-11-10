import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { KycPayInLimit } from '../documents/application/kyc-pay-in-limit';
import { DocumentsModule } from '../documents/documents.module';
import { ADMIN_USER_ACTIONS } from './application/ports/admin-user-actions.port';
import { ADMIN_USERS_QUERY } from './application/ports/admin-users-query.port';
import {
  RevealUserContactUseCase,
  RevokeUserSessionsUseCase,
  SetUserBlockedUseCase,
  SupportNotesUseCase,
} from './application/use-cases/admin-user-actions.use-cases';
import { SqlAdminUserActions } from './infrastructure/persistence/sql-admin-user-actions';
import { PAY_IN_LIMIT } from './application/ports/pay-in-limit.port';
import { USER_REPOSITORY } from './application/ports/user-repository.port';
import {
  GetAdminUserUseCase,
  SearchAdminUsersUseCase,
} from './application/use-cases/admin-users.use-cases';
import { GetMyProfileUseCase } from './application/use-cases/get-my-profile.use-case';
import { UpdatePersonalInfoUseCase } from './application/use-cases/update-personal-info.use-case';
import { UserEntity } from './infrastructure/persistence/typeorm/user.entity';
import { TypeOrmUserRepository } from './infrastructure/persistence/typeorm/typeorm-user.repository';
import { SqlAdminUsersQuery } from './infrastructure/persistence/sql-admin-users.query';
import { AdminUsersController } from './presentation/http/controllers/admin-users.controller';
import { MeController } from './presentation/http/controllers/me.controller';

/** Usuarios y su perfil (`/v1/me`). Exporta el repositorio para el módulo auth. */
@Module({
  imports: [TypeOrmModule.forFeature([UserEntity]), DocumentsModule],
  controllers: [MeController, AdminUsersController],
  providers: [
    UpdatePersonalInfoUseCase,
    GetMyProfileUseCase,
    { provide: PAY_IN_LIMIT, useExisting: KycPayInLimit },
    TypeOrmUserRepository,
    { provide: USER_REPOSITORY, useExisting: TypeOrmUserRepository },
    // Búsqueda de personas del back-office (docs/backoffice-plan.md, fase 2).
    SearchAdminUsersUseCase,
    GetAdminUserUseCase,
    { provide: ADMIN_USERS_QUERY, useClass: SqlAdminUsersQuery },
    // Acciones de soporte: sesiones, bloqueo, dato completo y notas.
    RevokeUserSessionsUseCase,
    SetUserBlockedUseCase,
    RevealUserContactUseCase,
    SupportNotesUseCase,
    { provide: ADMIN_USER_ACTIONS, useClass: SqlAdminUserActions },
  ],
  exports: [USER_REPOSITORY, GetMyProfileUseCase],
})
export class UsersModule {}
