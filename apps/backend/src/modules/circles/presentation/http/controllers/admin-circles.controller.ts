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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { ValidationError } from '../../../../../shared/errors/app-error';
import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import { type StaffRole } from '../../../../../shared/application/ports/staff-authenticator.port';
import { RequireStaff, StaffGuard } from '../../../../../shared/presentation/guards/staff.guard';
import { type AppRequest } from '../../../../../shared/presentation/http/app-request';
import { StaffAudited } from '../../../../../shared/presentation/interceptors/staff-audit.interceptor';
import {
  GetAdminCircleUseCase,
  ListAdminCirclesUseCase,
} from '../../../application/use-cases/admin-circles.use-cases';
import { SetCirclePauseUseCase } from '../../../application/use-cases/set-circle-pause.use-case';
import {
  AdminCircleDetailResponse,
  AdminCircleSummaryResponse,
  AdminCirclesQuery,
  AdminCirclesResponse,
} from '../dto/admin-circles.dto';
import { CirclePauseRequest, CirclePauseResponse } from '../dto/circle-pause.dto';

/** Quién ve los círculos (matriz de docs/backoffice-plan.md §5). */
const CIRCLE_READERS: readonly StaffRole[] = ['support', 'operations', 'finance', 'super_admin'];
const DEFAULT_PAGE_SIZE = 25;

const CIRCLE_ID = new ParseUUIDPipe({
  exceptionFactory: () =>
    new ValidationError('El circleId debe ser un UUID', { circleId: 'invalid' }),
});

/**
 * API de administración de los círculos (COPAYNI-61, docs/backoffice-plan.md). No usa el token de
 * la app sino el del personal, y no debe publicarse en el ALB público (BO8).
 */
@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1/circles', version: VERSION_NEUTRAL })
export class AdminCirclesController {
  constructor(
    @Inject(SetCirclePauseUseCase) private readonly setPause: SetCirclePauseUseCase,
    @Inject(ListAdminCirclesUseCase) private readonly listCircles: ListAdminCirclesUseCase,
    @Inject(GetAdminCircleUseCase) private readonly getCircle: GetAdminCircleUseCase,
  ) {}

  @Get()
  @RequireStaff(CIRCLE_READERS)
  @ApiOkResponse({
    type: AdminCirclesResponse,
    description: 'Envuelto. Del más nuevo al más antiguo',
  })
  @ApiBadRequestResponse({ description: 'state, limit o cursor inválidos (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no puede ver círculos (FORBIDDEN)' })
  async list(@Query() query: AdminCirclesQuery): Promise<AdminCirclesResponse> {
    const page = await this.listCircles.execute({
      state: query.state,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    });
    return {
      items: page.items.map((circle) => AdminCircleSummaryResponse.from(circle)),
      nextCursor: page.nextCursor,
    };
  }

  @Get(':circleId')
  @RequireStaff(CIRCLE_READERS)
  @ApiOkResponse({
    type: AdminCircleDetailResponse,
    description: 'Envuelto. Miembros con datos personales enmascarados',
  })
  @ApiBadRequestResponse({ description: 'circleId no es UUID (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no puede ver círculos (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'CIRCLE_NOT_FOUND' })
  async detail(@Param('circleId', CIRCLE_ID) circleId: string): Promise<AdminCircleDetailResponse> {
    return AdminCircleDetailResponse.fromView(await this.getCircle.execute(circleId));
  }

  @Post(':circleId/pause')
  @HttpCode(HttpStatus.OK)
  @RequireStaff('super_admin', { stepUp: true })
  @StaffAudited('circle.pause', { entity: 'circle', idParam: 'circleId', bodyFields: ['reason'] })
  @ApiOkResponse({
    type: CirclePauseResponse,
    description: 'Envuelto. `changed: false` si ya lo estaba',
  })
  @ApiBadRequestResponse({
    description: 'circleId no es UUID o falta el motivo (VALIDATION_ERROR)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o sin autenticación reciente' })
  @ApiForbiddenResponse({ description: 'El personal no tiene el rol super_admin (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'CIRCLE_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({
    description: 'El círculo no está en curso (INVALID_CYCLE_TRANSITION)',
  })
  pause(
    @Param('circleId', CIRCLE_ID) circleId: string,
    @Body() body: CirclePauseRequest,
    @Req() request: AppRequest,
  ): Promise<CirclePauseResponse> {
    return this.run(circleId, 'pause', body, request);
  }

  @Post(':circleId/resume')
  @HttpCode(HttpStatus.OK)
  @RequireStaff('super_admin', { stepUp: true })
  @StaffAudited('circle.resume', { entity: 'circle', idParam: 'circleId', bodyFields: ['reason'] })
  @ApiOkResponse({
    type: CirclePauseResponse,
    description: 'Envuelto. `changed: false` si ya lo estaba',
  })
  @ApiBadRequestResponse({
    description: 'circleId no es UUID o falta el motivo (VALIDATION_ERROR)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o sin autenticación reciente' })
  @ApiForbiddenResponse({ description: 'El personal no tiene el rol super_admin (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'CIRCLE_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({
    description: 'El círculo no está pausado ni en curso (INVALID_CYCLE_TRANSITION)',
  })
  resume(
    @Param('circleId', CIRCLE_ID) circleId: string,
    @Body() body: CirclePauseRequest,
    @Req() request: AppRequest,
  ): Promise<CirclePauseResponse> {
    return this.run(circleId, 'resume', body, request);
  }

  private async run(
    circleId: string,
    action: 'pause' | 'resume',
    body: CirclePauseRequest,
    request: AppRequest,
  ): Promise<CirclePauseResponse> {
    const result = await this.setPause.execute({
      circleId,
      action,
      actorId: request.staff!.staffId,
      reason: body.reason,
    });
    return { circleId, ...result };
  }
}
