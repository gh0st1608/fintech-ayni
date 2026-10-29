import { Body, Controller, Get, Headers, HttpStatus, Inject, Post, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { ValidationError } from '../../../../../shared/errors/app-error';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { AddCardUseCase, ListCardsUseCase } from '../../../application/use-cases/add-card.use-case';
import { AddCardRequest, SavedCardResponse, SavedCardsResponse } from '../dto/cards.dto';

/** La genera la app una vez por formulario y la repite en los reintentos. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,255}$/;

interface StatusResponse {
  status(code: number): unknown;
}

/** Tarjetas guardadas (COPAYNI-39 y 40, docs/api/payments.md). */
@ApiTags('payments')
@ApiBearerAuth()
@Controller({ path: 'me/cards', version: '1' })
export class CardsController {
  constructor(
    @Inject(AddCardUseCase) private readonly addCard: AddCardUseCase,
    @Inject(ListCardsUseCase) private readonly listCards: ListCardsUseCase,
  ) {}

  @Get()
  @ApiOkResponse({
    type: SavedCardsResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async list(@CurrentPrincipal() principal: Principal): Promise<SavedCardsResponse> {
    return SavedCardsResponse.from(await this.listCards.execute(principal));
  }

  @Post()
  @ApiHeader({ name: 'Idempotency-Key', required: true, description: '16 a 255 [A-Za-z0-9_-]' })
  @ApiCreatedResponse({ type: SavedCardResponse, description: 'Tarjeta guardada. Envuelto' })
  @ApiOkResponse({ type: SavedCardResponse, description: 'Reintento: ya estaba guardada' })
  @ApiBadRequestResponse({ description: 'Token o Idempotency-Key inválidos (VALIDATION_ERROR)' })
  @ApiUnprocessableEntityResponse({ description: 'CARD_REJECTED o EMAIL_REQUIRED' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async add(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: AddCardRequest,
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<SavedCardResponse> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new ValidationError('Falta Idempotency-Key o no es válida', {
        'Idempotency-Key': 'invalid',
      });
    }
    const result = await this.addCard.execute(principal, { token: body.token, idempotencyKey });
    if (!result.created) response.status(HttpStatus.OK);
    return SavedCardResponse.from(result.card);
  }
}
