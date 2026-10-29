import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { ListMyCirclesUseCase } from '../../../application/use-cases/list-my-circles.use-case';
import { MyCirclesQuery, MyCirclesResponse } from '../dto/my-circles.dto';

@ApiTags('circles')
@ApiBearerAuth()
@Controller({ path: 'me/circles', version: '1' })
export class MyCirclesController {
  constructor(@Inject(ListMyCirclesUseCase) private readonly listMyCircles: ListMyCirclesUseCase) {}

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
