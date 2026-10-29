import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
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
import { RequireStaff, StaffGuard } from '../../../../../shared/presentation/guards/staff.guard';
import { type AppRequest } from '../../../../../shared/presentation/http/app-request';
import { SetCirclePauseUseCase } from '../../../application/use-cases/set-circle-pause.use-case';
import { CirclePauseRequest, CirclePauseResponse } from '../dto/circle-pause.dto';

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
  constructor(@Inject(SetCirclePauseUseCase) private readonly setPause: SetCirclePauseUseCase) {}

  @Post(':circleId/pause')
  @HttpCode(HttpStatus.OK)
  @RequireStaff('super_admin', { stepUp: true })
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
