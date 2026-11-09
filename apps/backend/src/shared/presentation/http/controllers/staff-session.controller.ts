import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { STAFF_ROLES } from '../../../application/ports/staff-authenticator.port';
import { NotFoundError } from '../../../errors/app-error';
import {
  DEV_STAFF_TOKENS,
  type DevStaffTokens,
} from '../../../infrastructure/staff/dev-staff-tokens';
import { Public } from '../../decorators/public.decorator';
import { RequireStaff, StaffGuard } from '../../guards/staff.guard';
import { type AppRequest } from '../app-request';
import {
  DevStaffSessionRequest,
  DevStaffSessionResponse,
  StaffMeResponse,
} from '../dto/staff-session.dto';

/** Sesión del personal en el back-office (docs/backoffice-plan.md, fase 1). */
@ApiTags('admin')
@Public()
@Controller({ path: 'admin/v1', version: VERSION_NEUTRAL })
export class StaffSessionController {
  constructor(@Inject(DEV_STAFF_TOKENS) private readonly devTokens: DevStaffTokens | null) {}

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(StaffGuard)
  @RequireStaff(STAFF_ROLES)
  @ApiOkResponse({ type: StaffMeResponse, description: 'Envuelto. El personal autenticado' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  me(@Req() request: AppRequest): StaffMeResponse {
    return StaffMeResponse.from(request.staff!);
  }

  /** Solo con `STAFF_AUTH_PROVIDER=dev` (prohibido en production); si no, 404. */
  @Post('dev/sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiCreatedResponse({ type: DevStaffSessionResponse, description: 'Envuelto. Token local' })
  @ApiNotFoundResponse({ description: 'El modo dev no está activo (NOT_FOUND)' })
  createDevSession(@Body() body: DevStaffSessionRequest): DevStaffSessionResponse {
    if (!this.devTokens) throw new NotFoundError('No existe esa ruta', 'NOT_FOUND');
    return this.devTokens.issue(body.email.toLowerCase(), body.roles);
  }
}
