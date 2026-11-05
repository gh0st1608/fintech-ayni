import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { ListMyCirclesUseCase } from '../../../application/use-cases/list-my-circles.use-case';
import {
  ListStartProposalsUseCase,
  RespondStartProposalUseCase,
} from '../../../application/use-cases/start-proposal.use-cases';
import { MyCirclesQuery, MyCirclesResponse } from '../dto/my-circles.dto';
import { StartProposalResponse, StartProposalsResponse } from '../dto/start-proposal.dto';

@ApiTags('circles')
@ApiBearerAuth()
@Controller({ path: 'me/circles', version: '1' })
export class MyCirclesController {
  constructor(
    @Inject(ListMyCirclesUseCase) private readonly listMyCircles: ListMyCirclesUseCase,
    @Inject(ListStartProposalsUseCase) private readonly startProposals: ListStartProposalsUseCase,
    @Inject(RespondStartProposalUseCase)
    private readonly respondProposal: RespondStartProposalUseCase,
  ) {}

  @Get('start-proposals')
  @ApiOkResponse({
    type: StartProposalsResponse,
    description: 'Envuelto. Círculos incompletos que esperan la respuesta del usuario (COPAYNI-62)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async proposals(@CurrentPrincipal() principal: Principal): Promise<StartProposalsResponse> {
    const views = await this.startProposals.execute(principal);
    return { items: views.map((view) => StartProposalResponse.from(view)) };
  }

  @Post(':circleId/start-proposal/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Respuesta guardada' })
  @ApiNotFoundResponse({ description: 'Sin propuesta para el usuario (START_PROPOSAL_NOT_FOUND)' })
  @ApiUnprocessableEntityResponse({ description: 'START_PROPOSAL_EXPIRED o SLOT_NOT_ALLOWED' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async accept(
    @CurrentPrincipal() principal: Principal,
    @Param('circleId', ParseUUIDPipe) circleId: string,
  ): Promise<void> {
    await this.respondProposal.execute(principal, circleId, 'accepted');
  }

  @Post(':circleId/start-proposal/withdraw')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Respuesta guardada. Sale sin penalidad al resolverse' })
  @ApiNotFoundResponse({ description: 'Sin propuesta para el usuario (START_PROPOSAL_NOT_FOUND)' })
  @ApiUnprocessableEntityResponse({ description: 'START_PROPOSAL_EXPIRED' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async withdraw(
    @CurrentPrincipal() principal: Principal,
    @Param('circleId', ParseUUIDPipe) circleId: string,
  ): Promise<void> {
    await this.respondProposal.execute(principal, circleId, 'withdrawn');
  }

  @Get()
  @ApiOkResponse({ type: MyCirclesResponse, description: 'Envuelto en { success, data, traceId }' })
  @ApiBadRequestResponse({
    description:
      'status ausente o inválido, limit fuera de 1-50 o cursor inválido (VALIDATION_ERROR)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @Query() query: MyCirclesQuery,
  ): Promise<MyCirclesResponse> {
    return MyCirclesResponse.from(
      await this.listMyCircles.execute(principal, {
        status: query.status,
        cursor: query.cursor ?? null,
        limit: query.limit,
      }),
    );
  }
}
