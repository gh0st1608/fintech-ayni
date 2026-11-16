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
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { CurrentPrincipal } from '../../../shared/presentation/decorators/current-principal.decorator';
import {
  GetNotificationPreferencesUseCase,
  RegisterPushDeviceUseCase,
  SaveNotificationPreferencesUseCase,
  UnregisterPushDeviceUseCase,
} from '../application/push.use-cases';
import {
  PreferencesResponse,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  UpdatePreferencesRequest,
} from './push.dto';

const ENVELOPE = 'Envuelto en { success, data, traceId }';

/** Dispositivos de la persona para el aviso en el celular (COPAYNI-85). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'me/devices', version: '1' })
export class PushDevicesController {
  constructor(
    @Inject(RegisterPushDeviceUseCase) private readonly register: RegisterPushDeviceUseCase,
    @Inject(UnregisterPushDeviceUseCase) private readonly unregister: UnregisterPushDeviceUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: RegisterDeviceResponse,
    description: `${ENVELOPE}. Repetir el mismo token no duplica el dispositivo`,
  })
  @ApiBadRequestResponse({ description: 'token o platform inválidos (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async registerDevice(
    @CurrentPrincipal() principal: Principal,
    @Body() body: RegisterDeviceRequest,
  ): Promise<RegisterDeviceResponse> {
    const device = await this.register.execute({
      userId: principal.userId,
      token: body.token,
      platform: body.platform,
    });
    return RegisterDeviceResponse.from(device);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiNoContentResponse({ description: 'Ese celular deja de recibir avisos' })
  @ApiBadRequestResponse({ description: 'token inválido (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  unregisterDevice(@Param('token') token: string): Promise<void> {
    return this.unregister.execute(token);
  }
}

/** Qué avisos quiere recibir la persona en el celular (COPAYNI-85). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller({ path: 'me/notification-preferences', version: '1' })
export class NotificationPreferencesController {
  constructor(
    @Inject(GetNotificationPreferencesUseCase)
    private readonly get: GetNotificationPreferencesUseCase,
    @Inject(SaveNotificationPreferencesUseCase)
    private readonly save: SaveNotificationPreferencesUseCase,
  ) {}

  @Get()
  @ApiOkResponse({
    type: PreferencesResponse,
    description: `${ENVELOPE}. Quien no las tocó las tiene todas activadas`,
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async current(@CurrentPrincipal() principal: Principal): Promise<PreferencesResponse> {
    return PreferencesResponse.from(await this.get.execute(principal.userId));
  }

  @Put()
  @ApiOkResponse({ type: PreferencesResponse, description: `${ENVELOPE}. Cómo quedaron` })
  @ApiBadRequestResponse({ description: 'Cuerpo inválido (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Body() body: UpdatePreferencesRequest,
  ): Promise<PreferencesResponse> {
    const updated = await this.save.execute(principal.userId, {
      pushEnabled: body.pushEnabled,
      categories: body.categories,
    });
    return PreferencesResponse.from(updated);
  }
}
