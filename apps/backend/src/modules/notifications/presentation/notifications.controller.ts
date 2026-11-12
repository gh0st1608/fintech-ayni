import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../shared/presentation/decorators/current-principal.decorator';
import {
  CountUnreadNotificationsUseCase,
  ListNotificationsUseCase,
  MarkNotificationsReadUseCase,
} from '../application/notifications.use-cases';
import {
  MarkNotificationsReadRequest,
  NotificationResponse,
  NotificationsQuery,
  NotificationsResponse,
  UnreadCountResponse,
} from './notifications.dto';

const ENVELOPE = 'Envuelto en { success, data, traceId }';
const DEFAULT_PAGE_SIZE = 20;

/** Bandeja de notificaciones de la persona (COPAYNI-84). Solo ve las suyas. */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'me/notifications', version: '1' })
export class NotificationsController {
  constructor(
    @Inject(ListNotificationsUseCase) private readonly listNotifications: ListNotificationsUseCase,
    @Inject(CountUnreadNotificationsUseCase)
    private readonly countUnread: CountUnreadNotificationsUseCase,
    @Inject(MarkNotificationsReadUseCase) private readonly markRead: MarkNotificationsReadUseCase,
  ) {}

  @Get()
  @ApiOkResponse({ type: NotificationsResponse, description: `${ENVELOPE}. De la más reciente` })
  @ApiBadRequestResponse({ description: 'category, limit o cursor inválidos' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: NotificationsQuery,
  ): Promise<NotificationsResponse> {
    const page = await this.listNotifications.execute(principal.userId, {
      category: query.category,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    });
    return {
      items: page.items.map((item) => NotificationResponse.from(item)),
      nextCursor: page.nextCursor,
      unread: page.unread,
    };
  }

  @Get('unread-count')
  @ApiOkResponse({ type: UnreadCountResponse, description: `${ENVELOPE}. El punto de la campana` })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async unread(@CurrentPrincipal() principal: Principal): Promise<UnreadCountResponse> {
    return { unread: await this.countUnread.execute(principal.userId) };
  }

  @Post('read')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: UnreadCountResponse,
    description: `${ENVELOPE}. Las no leídas que quedan`,
  })
  @ApiBadRequestResponse({ description: 'ids inválidos (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  read(
    @CurrentPrincipal() principal: Principal,
    @Body() body: MarkNotificationsReadRequest,
  ): Promise<UnreadCountResponse> {
    return this.markRead.execute(principal.userId, body.ids ?? null);
  }
}
