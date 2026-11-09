import {
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type StaffRole } from '../../../../../shared/application/ports/staff-authenticator.port';
import { ValidationError } from '../../../../../shared/errors/app-error';
import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import { RequireStaff, StaffGuard } from '../../../../../shared/presentation/guards/staff.guard';
import { StaffAudited } from '../../../../../shared/presentation/interceptors/staff-audit.interceptor';
import {
  GetAdminUserUseCase,
  SearchAdminUsersUseCase,
} from '../../../application/use-cases/admin-users.use-cases';
import {
  AdminUserDetailResponse,
  AdminUserResponse,
  AdminUsersQuery,
  AdminUsersResponse,
} from '../dto/admin-users.dto';

/** Quién busca personas (matriz de docs/backoffice-plan.md §5): todo el personal operativo. */
const USER_READERS: readonly StaffRole[] = ['support', 'operations', 'finance', 'super_admin'];

/**
 * Búsqueda de personas para soporte (docs/backoffice-plan.md, fase 2). Solo búsquedas exactas y
 * resultados enmascarados. Cada búsqueda y cada vista quedan en la auditoría, sin el dato buscado.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1/users', version: VERSION_NEUTRAL })
export class AdminUsersController {
  constructor(
    @Inject(SearchAdminUsersUseCase) private readonly searchUsers: SearchAdminUsersUseCase,
    @Inject(GetAdminUserUseCase) private readonly getUser: GetAdminUserUseCase,
  ) {}

  @Get()
  @RequireStaff(USER_READERS)
  @StaffAudited('user.search', { entity: 'user' })
  @ApiOkResponse({ type: AdminUsersResponse, description: 'Envuelto. Datos enmascarados' })
  @ApiBadRequestResponse({
    description: 'La búsqueda no es un email, teléfono o id (VALIDATION_ERROR)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no busca personas (FORBIDDEN)' })
  async search(@Query() query: AdminUsersQuery): Promise<AdminUsersResponse> {
    const users = await this.searchUsers.execute(query.query);
    return { items: users.map((user) => AdminUserResponse.from(user)) };
  }

  @Get(':userId')
  @RequireStaff(USER_READERS)
  @StaffAudited('user.view', { entity: 'user', idParam: 'userId' })
  @ApiOkResponse({ type: AdminUserDetailResponse, description: 'Envuelto. Datos enmascarados' })
  @ApiBadRequestResponse({ description: 'userId no es UUID (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no busca personas (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  async detail(
    @Param(
      'userId',
      new ParseUUIDPipe({
        exceptionFactory: () =>
          new ValidationError('El userId debe ser un UUID', { userId: 'invalid' }),
      }),
    )
    userId: string,
  ): Promise<AdminUserDetailResponse> {
    return AdminUserDetailResponse.fromView(await this.getUser.execute(userId));
  }
}
