import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ListSavingPlansUseCase, QuoteSavingPlanUseCase } from '../application/saving.use-cases';
import { SavingPlansResponse, SavingQuoteQuery, SavingQuoteResponse } from './savings.dto';

/** Programa de ahorro con cashback (COPAYNI-32 y 33, docs/api/savings.md). */
@ApiTags('savings')
@ApiBearerAuth()
@Controller({ path: 'savings/plans', version: '1' })
export class SavingsController {
  constructor(
    @Inject(ListSavingPlansUseCase) private readonly listPlans: ListSavingPlansUseCase,
    @Inject(QuoteSavingPlanUseCase) private readonly quotePlan: QuoteSavingPlanUseCase,
  ) {}

  @Get()
  @ApiOkResponse({
    type: SavingPlansResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  plans(): SavingPlansResponse {
    return SavingPlansResponse.from(this.listPlans.execute(), this.listPlans.durations());
  }

  @Get(':id/quote')
  @ApiOkResponse({
    type: SavingQuoteResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiBadRequestResponse({ description: 'months ausente o no ofrecido (VALIDATION_ERROR)' })
  @ApiNotFoundResponse({ description: 'SAVING_PLAN_NOT_FOUND' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  quote(@Param('id') id: string, @Query() query: SavingQuoteQuery): SavingQuoteResponse {
    return SavingQuoteResponse.from(this.quotePlan.execute(id, query.months));
  }
}
