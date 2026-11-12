import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Put,
  Query,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type StaffRole } from '../../../shared/application/ports/staff-authenticator.port';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { RequireStaff, StaffGuard } from '../../../shared/presentation/guards/staff.guard';
import { type AppRequest } from '../../../shared/presentation/http/app-request';
import { StaffAudited } from '../../../shared/presentation/interceptors/staff-audit.interceptor';
import { GetAdminHelpUseCase, GetHelpUseCase, UpdateHelpUseCase } from '../application/help';
import { AdminHelpResponse, HelpQuery, HelpResponse, UpdateHelpRequest } from './help.dto';

/** Ayuda de la app (COPAYNI-83): pública, para que también sirva antes de iniciar sesión. */
@ApiTags('help')
@Public()
@Controller({ path: 'help', version: '1' })
export class HelpController {
  constructor(@Inject(GetHelpUseCase) private readonly getHelp: GetHelpUseCase) {}

  @Get()
  @ApiOkResponse({ type: HelpResponse, description: 'Envuelto. Cae a es si el idioma no tiene' })
  async get(@Query() query: HelpQuery): Promise<HelpResponse> {
    const { content, supportWhatsapp } = await this.getHelp.execute(query.lang);
    return HelpResponse.from(content, supportWhatsapp);
  }
}

/** Quién edita la ayuda: contenido de la app (docs/backoffice-plan.md, fase 5). */
const HELP_EDITORS: readonly StaffRole[] = ['operations', 'super_admin'];
const HELP_READERS: readonly StaffRole[] = ['support', 'operations', 'super_admin'];

@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1/help', version: VERSION_NEUTRAL })
export class AdminHelpController {
  constructor(
    @Inject(GetAdminHelpUseCase) private readonly getHelp: GetAdminHelpUseCase,
    @Inject(UpdateHelpUseCase) private readonly updateHelp: UpdateHelpUseCase,
  ) {}

  @Get(':lang')
  @RequireStaff(HELP_READERS)
  @ApiOkResponse({ type: AdminHelpResponse, description: 'Envuelto' })
  @ApiBadRequestResponse({ description: 'Idioma no admitido (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no ve la ayuda (FORBIDDEN)' })
  async get(@Param('lang') lang: string): Promise<AdminHelpResponse> {
    return AdminHelpResponse.from(await this.getHelp.execute(lang));
  }

  @Put(':lang')
  @RequireStaff(HELP_EDITORS)
  @StaffAudited('help.update', { entity: 'help', idParam: 'lang' })
  @ApiOkResponse({ type: AdminHelpResponse, description: 'Envuelto. Se publica al instante' })
  @ApiBadRequestResponse({ description: 'Pregunta sin respuesta, demasiadas o idioma inválido' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no edita la ayuda (FORBIDDEN)' })
  async put(
    @Param('lang') lang: string,
    @Body() body: UpdateHelpRequest,
    @Req() request: AppRequest,
  ): Promise<AdminHelpResponse> {
    const saved = await this.updateHelp.execute(
      lang,
      { faqs: body.faqs, paymentPolicy: body.paymentPolicy ?? null },
      request.staff!.email ?? request.staff!.staffId,
    );
    return AdminHelpResponse.from(saved);
  }
}
