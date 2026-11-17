import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
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
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type StaffRole } from '../../../shared/application/ports/staff-authenticator.port';
import { RequireStaff, StaffGuard } from '../../../shared/presentation/guards/staff.guard';
import { type AppRequest } from '../../../shared/presentation/http/app-request';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { StaffAudited } from '../../../shared/presentation/interceptors/staff-audit.interceptor';
import {
  GetHomeContentUseCase,
  ListHomeContentUseCase,
  RemoveHomeContentUseCase,
  SaveHomeGoalUseCase,
  SaveHomeOfferUseCase,
} from '../application/home-content';
import {
  AdminHomeContentResponse,
  AdminHomeItemResponse,
  HomeContentQuery,
  HomeContentResponse,
  SaveGoalRequest,
  SaveOfferRequest,
  toTexts,
} from './home-content.dto';

/**
 * Contenido de Home para la app (COPAYNI-25): ofertas y metas populares, solo lo activo y vigente
 * y ya ordenado. Es el mismo para todas las personas (BO5), así que se puede cachear por idioma.
 */
@ApiTags('home')
@ApiBearerAuth()
@Controller({ path: 'home/content', version: '1' })
export class HomeContentController {
  constructor(@Inject(GetHomeContentUseCase) private readonly getContent: GetHomeContentUseCase) {}

  @Get()
  @ApiOkResponse({
    type: HomeContentResponse,
    description: 'Envuelto. Una sección vacía se oculta en la app',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async get(@Query() query: HomeContentQuery): Promise<HomeContentResponse> {
    return HomeContentResponse.from(await this.getContent.execute(query.lang));
  }
}

/** Quién edita el contenido de la app; los mismos roles que la ayuda (COPAYNI-83). */
const CONTENT_EDITORS: readonly StaffRole[] = ['operations', 'super_admin'];
const CONTENT_READERS: readonly StaffRole[] = ['support', 'operations', 'super_admin'];

@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1/home-content', version: VERSION_NEUTRAL })
export class AdminHomeContentController {
  constructor(
    @Inject(ListHomeContentUseCase) private readonly list: ListHomeContentUseCase,
    @Inject(SaveHomeOfferUseCase) private readonly saveOffer: SaveHomeOfferUseCase,
    @Inject(SaveHomeGoalUseCase) private readonly saveGoal: SaveHomeGoalUseCase,
    @Inject(RemoveHomeContentUseCase) private readonly remove: RemoveHomeContentUseCase,
  ) {}

  @Get()
  @RequireStaff(CONTENT_READERS)
  @ApiOkResponse({ type: AdminHomeContentResponse, description: 'Envuelto. Incluye lo apagado' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no ve el contenido (FORBIDDEN)' })
  async all(): Promise<AdminHomeContentResponse> {
    return AdminHomeContentResponse.from(await this.list.execute());
  }

  @Post('offers')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(CONTENT_EDITORS)
  @StaffAudited('home_content.create_offer', { entity: 'home_offer' })
  @ApiOkResponse({ type: AdminHomeItemResponse, description: 'Envuelto. Se publica al instante' })
  @ApiBadRequestResponse({ description: 'Texto, destino o vigencia inválidos' })
  createOffer(
    @Body() body: SaveOfferRequest,
    @Req() request: AppRequest,
  ): Promise<AdminHomeItemResponse> {
    return this.persistOffer(null, body, request);
  }

  @Put('offers/:id')
  @RequireStaff(CONTENT_EDITORS)
  @StaffAudited('home_content.update_offer', { entity: 'home_offer', idParam: 'id' })
  @ApiOkResponse({ type: AdminHomeItemResponse, description: 'Envuelto' })
  @ApiBadRequestResponse({ description: 'Texto, destino o vigencia inválidos' })
  updateOffer(
    @Param('id') id: string,
    @Body() body: SaveOfferRequest,
    @Req() request: AppRequest,
  ): Promise<AdminHomeItemResponse> {
    return this.persistOffer(id, body, request);
  }

  @Post('goals')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(CONTENT_EDITORS)
  @StaffAudited('home_content.create_goal', { entity: 'home_goal' })
  @ApiOkResponse({ type: AdminHomeItemResponse, description: 'Envuelto. Se publica al instante' })
  @ApiBadRequestResponse({ description: 'Texto o destino inválidos' })
  createGoal(
    @Body() body: SaveGoalRequest,
    @Req() request: AppRequest,
  ): Promise<AdminHomeItemResponse> {
    return this.persistGoal(null, body, request);
  }

  @Put('goals/:id')
  @RequireStaff(CONTENT_EDITORS)
  @StaffAudited('home_content.update_goal', { entity: 'home_goal', idParam: 'id' })
  @ApiOkResponse({ type: AdminHomeItemResponse, description: 'Envuelto' })
  @ApiBadRequestResponse({ description: 'Texto o destino inválidos' })
  updateGoal(
    @Param('id') id: string,
    @Body() body: SaveGoalRequest,
    @Req() request: AppRequest,
  ): Promise<AdminHomeItemResponse> {
    return this.persistGoal(id, body, request);
  }

  @Delete('offers/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireStaff(CONTENT_EDITORS)
  @StaffAudited('home_content.delete_offer', { entity: 'home_offer', idParam: 'id' })
  @ApiNoContentResponse({ description: 'Borrada' })
  @ApiNotFoundResponse({ description: 'No existe (CONTENT_NOT_FOUND)' })
  deleteOffer(@Param('id') id: string): Promise<void> {
    return this.remove.execute('offer', id);
  }

  @Delete('goals/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequireStaff(CONTENT_EDITORS)
  @StaffAudited('home_content.delete_goal', { entity: 'home_goal', idParam: 'id' })
  @ApiNoContentResponse({ description: 'Borrada' })
  @ApiNotFoundResponse({ description: 'No existe (CONTENT_NOT_FOUND)' })
  deleteGoal(@Param('id') id: string): Promise<void> {
    return this.remove.execute('goal', id);
  }

  private async persistOffer(
    id: string | null,
    body: SaveOfferRequest,
    request: AppRequest,
  ): Promise<AdminHomeItemResponse> {
    const saved = await this.saveOffer.execute(
      id,
      {
        texts: toTexts(body.texts),
        illustration: body.illustration,
        target: body.target,
        targetAmount: body.targetAmount ?? null,
        position: body.position,
        active: body.active,
        background: body.background,
        startsOn: body.startsOn ? new Date(body.startsOn) : null,
        endsOn: body.endsOn ? new Date(body.endsOn) : null,
      },
      editorOf(request),
    );
    return AdminHomeItemResponse.from(saved);
  }

  private async persistGoal(
    id: string | null,
    body: SaveGoalRequest,
    request: AppRequest,
  ): Promise<AdminHomeItemResponse> {
    const saved = await this.saveGoal.execute(
      id,
      {
        texts: toTexts(body.texts),
        illustration: body.illustration,
        target: body.target,
        targetAmount: body.targetAmount ?? null,
        position: body.position,
        active: body.active,
        background: body.background,
      },
      editorOf(request),
    );
    return AdminHomeItemResponse.from(saved);
  }
}

/** Quién hizo el cambio, para mostrarlo en el back-office junto a la auditoría. */
const editorOf = (request: AppRequest): string => request.staff!.email ?? request.staff!.staffId;
