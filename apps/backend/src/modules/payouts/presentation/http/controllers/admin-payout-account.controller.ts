import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Put,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type StaffRole } from '../../../../../shared/application/ports/staff-authenticator.port';
import { ValidationError } from '../../../../../shared/errors/app-error';
import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import { RequireStaff, StaffGuard } from '../../../../../shared/presentation/guards/staff.guard';
import { type AppRequest } from '../../../../../shared/presentation/http/app-request';
import { StaffAudited } from '../../../../../shared/presentation/interceptors/staff-audit.interceptor';
import {
  GetAdminPayoutAccountsUseCase,
  RegisterPayoutAccountUseCase,
} from '../../../application/use-cases/payout-account.use-cases';
import { PERU_BANKS } from '../../../domain/payout-account';
import {
  AdminPayoutAccountResponse,
  AdminPayoutAccountsResponse,
  RegisterPayoutAccountRequest,
} from '../dto/payout-account.dto';

/** Ven la cuenta enmascarada: quienes atienden a la persona y Finanzas. */
const ACCOUNT_READERS: readonly StaffRole[] = ['support', 'operations', 'finance', 'super_admin'];
/** Registran la cuenta (a dónde va el dinero): Operaciones, con autenticación reciente. */
const ACCOUNT_WRITERS: readonly StaffRole[] = ['operations', 'super_admin'];

const USER_ID = new ParseUUIDPipe({
  exceptionFactory: () => new ValidationError('El userId debe ser un UUID', { userId: 'invalid' }),
});

/** Cuenta de cobro del payout registrada por el personal (COPAYNI-81). */
@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1/users/:userId/payout-account', version: VERSION_NEUTRAL })
export class AdminPayoutAccountController {
  constructor(
    @Inject(GetAdminPayoutAccountsUseCase)
    private readonly getAccounts: GetAdminPayoutAccountsUseCase,
    @Inject(RegisterPayoutAccountUseCase) private readonly register: RegisterPayoutAccountUseCase,
  ) {}

  @Get()
  @RequireStaff(ACCOUNT_READERS)
  @StaffAudited('user.payout_account.view', { entity: 'user', idParam: 'userId' })
  @ApiOkResponse({ type: AdminPayoutAccountsResponse, description: 'Envuelto. Enmascaradas' })
  @ApiBadRequestResponse({ description: 'userId no es UUID (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no ve cuentas (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  async list(@Param('userId', USER_ID) userId: string): Promise<AdminPayoutAccountsResponse> {
    const { current, history } = await this.getAccounts.execute(userId);
    return {
      current: current ? AdminPayoutAccountResponse.fromAccount(current) : null,
      history: history.map((account) => AdminPayoutAccountResponse.fromAccount(account)),
      banks: { ...PERU_BANKS },
    };
  }

  @Put()
  @RequireStaff(ACCOUNT_WRITERS, { stepUp: true })
  @StaffAudited('user.payout_account.register', {
    entity: 'user',
    idParam: 'userId',
    bodyFields: ['reason', 'kind', 'bankCode', 'provider'],
  })
  @ApiOkResponse({ type: AdminPayoutAccountResponse, description: 'Envuelto. Enmascarada' })
  @ApiBadRequestResponse({
    description: 'Campo inválido: CCI con dígito de control incorrecto, celular, banco o motivo',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o sin autenticación reciente' })
  @ApiForbiddenResponse({ description: 'El rol no registra cuentas (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'USER_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({
    description: 'PAYOUT_ACCOUNT_IDENTITY_REQUIRED o PAYOUT_ACCOUNT_HOLDER_MISMATCH',
  })
  @ApiConflictResponse({
    description: 'PAYOUT_ACCOUNT_CHANGE_NOT_ALLOWED (mes de cobro) o PAYOUT_ACCOUNT_CONFLICT',
  })
  async put(
    @Param('userId', USER_ID) userId: string,
    @Body() body: RegisterPayoutAccountRequest,
    @Req() request: AppRequest,
  ): Promise<AdminPayoutAccountResponse> {
    const account = await this.register.execute({
      userId,
      account: body.toInput(),
      reason: body.reason,
      staff: { staffId: request.staff!.staffId, email: request.staff!.email ?? null },
    });
    return AdminPayoutAccountResponse.fromAccount(account);
  }
}
