import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { GetAvailableSlotsUseCase } from '../../../application/use-cases/get-available-slots.use-case';
import { GetInstallmentOptionsUseCase } from '../../../application/use-cases/get-installment-options.use-case';
import { GetJoinConfigUseCase } from '../../../application/use-cases/get-join-config.use-case';
import {
  InstallmentOptionsQuery,
  InstallmentOptionsResponse,
} from '../dto/installment-options.dto';
import { JoinConfigResponse } from '../dto/join-config.response';
import { SlotsQuery, SlotsResponse } from '../dto/slots.dto';

@ApiTags('circles')
@ApiBearerAuth()
@Controller({ path: 'circles', version: '1' })
export class CirclesController {
  constructor(
    @Inject(GetJoinConfigUseCase) private readonly getJoinConfig: GetJoinConfigUseCase,
    @Inject(GetInstallmentOptionsUseCase)
    private readonly getInstallmentOptions: GetInstallmentOptionsUseCase,
    @Inject(GetAvailableSlotsUseCase) private readonly getAvailableSlots: GetAvailableSlotsUseCase,
  ) {}

  @Get('join-config')
  @ApiOkResponse({
    type: JoinConfigResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async joinConfig(@CurrentPrincipal() principal: Principal): Promise<JoinConfigResponse> {
    return JoinConfigResponse.from(await this.getJoinConfig.execute(principal));
  }

  @Get('installment-options')
  @ApiOkResponse({
    type: InstallmentOptionsResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiBadRequestResponse({ description: 'payoutAmount ausente o no entero (VALIDATION_ERROR)' })
  @ApiUnprocessableEntityResponse({
    description: 'Payout fuera del rango o del salto permitidos (PAYOUT_NOT_ALLOWED)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async installmentOptions(
    @CurrentPrincipal() principal: Principal,
    @Query() query: InstallmentOptionsQuery,
  ): Promise<InstallmentOptionsResponse> {
    return InstallmentOptionsResponse.from(
      await this.getInstallmentOptions.execute(principal, query.payoutAmount),
    );
  }

  @Get('slots')
  @ApiOkResponse({ type: SlotsResponse, description: 'Envuelto en { success, data, traceId }' })
  @ApiBadRequestResponse({
    description: 'payoutAmount o months ausentes, o months no ofrecido (VALIDATION_ERROR)',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Payout fuera del rango o del salto permitidos (PAYOUT_NOT_ALLOWED)',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async slots(
    @CurrentPrincipal() principal: Principal,
    @Query() query: SlotsQuery,
  ): Promise<SlotsResponse> {
    return SlotsResponse.from(
      await this.getAvailableSlots.execute(principal, query.payoutAmount, query.months),
    );
  }
}
