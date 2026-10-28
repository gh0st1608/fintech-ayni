import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../../../shared/application/ports/access-token-verifier.port';
import { ValidationError } from '../../../../../shared/errors/app-error';
import { CurrentPrincipal } from '../../../../../shared/presentation/decorators/current-principal.decorator';
import { GetAvailableSlotsUseCase } from '../../../application/use-cases/get-available-slots.use-case';
import { GetInstallmentOptionsUseCase } from '../../../application/use-cases/get-installment-options.use-case';
import { GetJoinConfigUseCase } from '../../../application/use-cases/get-join-config.use-case';
import { JoinCircleUseCase } from '../../../application/use-cases/join-circle.use-case';
import {
  InstallmentOptionsQuery,
  InstallmentOptionsResponse,
} from '../dto/installment-options.dto';
import { JoinCircleRequest, JoinCircleResponse } from '../dto/join-circle.dto';
import { JoinConfigResponse } from '../dto/join-config.response';
import { SlotsQuery, SlotsResponse } from '../dto/slots.dto';

/** La genera el cliente una vez por borrador (en la app, un UUID) y la repite en los reintentos. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_-]{16,255}$/;

/** Lo único que el controlador usa de la respuesta de Express. */
interface StatusResponse {
  status(code: number): unknown;
}

@ApiTags('circles')
@ApiBearerAuth()
@Controller({ path: 'circles', version: '1' })
export class CirclesController {
  constructor(
    @Inject(GetJoinConfigUseCase) private readonly getJoinConfig: GetJoinConfigUseCase,
    @Inject(GetInstallmentOptionsUseCase)
    private readonly getInstallmentOptions: GetInstallmentOptionsUseCase,
    @Inject(GetAvailableSlotsUseCase) private readonly getAvailableSlots: GetAvailableSlotsUseCase,
    @Inject(JoinCircleUseCase) private readonly joinCircle: JoinCircleUseCase,
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

  @Post('join')
  @ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    description: 'Una por borrador, de 16 a 255 caracteres [A-Za-z0-9_-]; se repite al reintentar',
  })
  @ApiCreatedResponse({ type: JoinCircleResponse, description: 'Unión creada. Envuelto' })
  @ApiOkResponse({ type: JoinCircleResponse, description: 'Reintento: la unión ya existía' })
  @ApiBadRequestResponse({
    description:
      'Cuerpo o Idempotency-Key inválidos, duración no ofrecida o círculo con otras condiciones (VALIDATION_ERROR)',
  })
  @ApiNotFoundResponse({ description: 'circleId inexistente (CIRCLE_NOT_FOUND)' })
  @ApiConflictResponse({
    description: 'SLOT_TAKEN, ALREADY_MEMBER, CIRCLE_ALREADY_STARTED o IDEMPOTENCY_KEY_REUSED',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'PAYOUT_NOT_ALLOWED, SLOT_OUT_OF_RANGE, NATIONAL_ID_REQUIRED, MONTHLY_LIMIT_EXCEEDED, PAYOUT_METHOD_REQUIRED o PAYOUT_METHOD_LIMIT_EXCEEDED',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async join(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: JoinCircleRequest,
    @Res({ passthrough: true }) response: StatusResponse,
  ): Promise<JoinCircleResponse> {
    if (!idempotencyKey || !IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new ValidationError('Falta Idempotency-Key o no es válida', {
        'Idempotency-Key': 'invalid',
      });
    }
    const result = await this.joinCircle.execute({
      ...body,
      userId: principal.userId,
      idempotencyKey,
    });
    if (!result.created) response.status(HttpStatus.OK);
    return JoinCircleResponse.from(result);
  }
}
