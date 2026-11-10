import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
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
import { type AppRequest } from '../../../../../shared/presentation/http/app-request';
import { StaffAudited } from '../../../../../shared/presentation/interceptors/staff-audit.interceptor';
import {
  RevealUserContactUseCase,
  RevokeUserSessionsUseCase,
  SetUserBlockedUseCase,
  SupportNotesUseCase,
} from '../../../application/use-cases/admin-user-actions.use-cases';
import {
  GetAdminUserUseCase,
  SearchAdminUsersUseCase,
} from '../../../application/use-cases/admin-users.use-cases';
import {
  AdminUserDetailResponse,
  AdminUserReasonRequest,
  AdminUserResponse,
  AdminUsersQuery,
  AdminUsersResponse,
  RevokeSessionsResponse,
  SupportNoteRequest,
  SupportNoteResponse,
  SupportNotesResponse,
  UserBlockResponse,
  UserContactResponse,
} from '../dto/admin-users.dto';

/** Quién busca personas (matriz de docs/backoffice-plan.md §5): todo el personal operativo. */
const USER_READERS: readonly StaffRole[] = ['support', 'operations', 'finance', 'super_admin'];
/** Revocar sesiones, bloquear o desbloquear, y escribir notas de soporte. */
const USER_SUPPORT: readonly StaffRole[] = ['support', 'operations', 'super_admin'];
/** Revelar el dato completo (con motivo y autenticación reciente). */
const PII_REVEALERS: readonly StaffRole[] = ['operations', 'super_admin'];

const USER_ID = new ParseUUIDPipe({
  exceptionFactory: () => new ValidationError('El userId debe ser un UUID', { userId: 'invalid' }),
});

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
    @Inject(RevokeUserSessionsUseCase) private readonly revokeSessions: RevokeUserSessionsUseCase,
    @Inject(SetUserBlockedUseCase) private readonly setBlocked: SetUserBlockedUseCase,
    @Inject(RevealUserContactUseCase) private readonly revealContact: RevealUserContactUseCase,
    @Inject(SupportNotesUseCase) private readonly supportNotes: SupportNotesUseCase,
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
  async detail(@Param('userId', USER_ID) userId: string): Promise<AdminUserDetailResponse> {
    return AdminUserDetailResponse.fromView(await this.getUser.execute(userId));
  }

  @Post(':userId/sessions/revoke')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(USER_SUPPORT)
  @StaffAudited('user.sessions.revoke', {
    entity: 'user',
    idParam: 'userId',
    bodyFields: ['reason'],
  })
  @ApiOkResponse({ type: RevokeSessionsResponse, description: 'Envuelto' })
  @ApiBadRequestResponse({ description: 'userId no es UUID o falta el motivo (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no puede hacerlo (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  revoke(
    @Param('userId', USER_ID) userId: string,
    @Body() body: AdminUserReasonRequest,
  ): Promise<RevokeSessionsResponse> {
    return this.revokeSessions.execute(userId, body.reason);
  }

  @Post(':userId/block')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(USER_SUPPORT)
  @StaffAudited('user.block', { entity: 'user', idParam: 'userId', bodyFields: ['reason'] })
  @ApiOkResponse({
    type: UserBlockResponse,
    description: 'Envuelto. Revoca las sesiones; la persona no puede abrir otra',
  })
  @ApiBadRequestResponse({ description: 'userId no es UUID o falta el motivo (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no puede hacerlo (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  block(
    @Param('userId', USER_ID) userId: string,
    @Body() body: AdminUserReasonRequest,
  ): Promise<UserBlockResponse> {
    return this.setBlocked.execute({ userId, action: 'block', reason: body.reason });
  }

  @Post(':userId/unblock')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(USER_SUPPORT, { stepUp: true })
  @StaffAudited('user.unblock', { entity: 'user', idParam: 'userId', bodyFields: ['reason'] })
  @ApiOkResponse({ type: UserBlockResponse, description: 'Envuelto' })
  @ApiBadRequestResponse({ description: 'userId no es UUID o falta el motivo (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o sin autenticación reciente' })
  @ApiForbiddenResponse({ description: 'El rol no puede hacerlo (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  unblock(
    @Param('userId', USER_ID) userId: string,
    @Body() body: AdminUserReasonRequest,
  ): Promise<UserBlockResponse> {
    return this.setBlocked.execute({ userId, action: 'unblock', reason: body.reason });
  }

  @Post(':userId/pii/reveal')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(PII_REVEALERS, { stepUp: true })
  @StaffAudited('user.pii.reveal', { entity: 'user', idParam: 'userId', bodyFields: ['reason'] })
  @ApiOkResponse({ type: UserContactResponse, description: 'Envuelto. Acción auditada' })
  @ApiBadRequestResponse({ description: 'userId no es UUID o falta el motivo (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o sin autenticación reciente' })
  @ApiForbiddenResponse({ description: 'El rol no puede revelar datos (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  async reveal(
    @Param('userId', USER_ID) userId: string,
    @Body() body: AdminUserReasonRequest,
  ): Promise<UserContactResponse> {
    return UserContactResponse.from(await this.revealContact.execute(userId, body.reason));
  }

  @Get(':userId/notes')
  @RequireStaff(USER_READERS)
  @ApiOkResponse({ type: SupportNotesResponse, description: 'Envuelto' })
  @ApiBadRequestResponse({ description: 'userId no es UUID (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no ve personas (FORBIDDEN)' })
  async notes(@Param('userId', USER_ID) userId: string): Promise<SupportNotesResponse> {
    const notes = await this.supportNotes.list(userId);
    return { items: notes.map((note) => SupportNoteResponse.from(note)) };
  }

  @Post(':userId/notes')
  @RequireStaff(USER_SUPPORT)
  @StaffAudited('user.note.add', { entity: 'user', idParam: 'userId' })
  @ApiCreatedResponse({ type: SupportNoteResponse, description: 'Envuelto. De solo inserción' })
  @ApiBadRequestResponse({ description: 'userId no es UUID o nota vacía (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no escribe notas (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  async addNote(
    @Param('userId', USER_ID) userId: string,
    @Body() body: SupportNoteRequest,
    @Req() request: AppRequest,
  ): Promise<SupportNoteResponse> {
    const note = await this.supportNotes.add({
      userId,
      body: body.body,
      authorId: request.staff!.staffId,
      authorEmail: request.staff!.email ?? null,
    });
    return SupportNoteResponse.from(note);
  }
}
