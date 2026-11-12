import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { type StaffRole } from '../../../../../shared/application/ports/staff-authenticator.port';
import { Public } from '../../../../../shared/presentation/decorators/public.decorator';
import { RequireStaff, StaffGuard } from '../../../../../shared/presentation/guards/staff.guard';
import { type AppRequest } from '../../../../../shared/presentation/http/app-request';
import { StaffAudited } from '../../../../../shared/presentation/interceptors/staff-audit.interceptor';
import {
  DecideApprovalUseCase,
  ListApprovalsUseCase,
  ProposeFundMovementUseCase,
} from '../../../application/use-cases/fund-approvals.use-cases';
import { type StaffActor } from '../../../domain/staff-approval';
import {
  ApprovalResponse,
  ApprovalsQuery,
  ApprovalsResponse,
  ProposeFundMovementRequest,
  RejectApprovalRequest,
} from '../dto/fund-approvals.dto';

/**
 * Proponen y deciden movimientos del fondo (matriz de docs/backoffice-plan.md §5). Regla
 * provisional hasta cerrar BO6: los mismos roles, pero nunca la misma persona.
 */
const FUND_OPERATORS: readonly StaffRole[] = ['finance', 'super_admin'];
const DEFAULT_PAGE_SIZE = 25;

const actorOf = (request: AppRequest): StaffActor => ({
  staffId: request.staff!.staffId,
  email: request.staff!.email ?? null,
});

/** Movimientos manuales del fondo de garantía con doble aprobación (COPAYNI-73). */
@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1', version: VERSION_NEUTRAL })
export class AdminFundApprovalsController {
  constructor(
    @Inject(ProposeFundMovementUseCase) private readonly propose: ProposeFundMovementUseCase,
    @Inject(ListApprovalsUseCase) private readonly listApprovals: ListApprovalsUseCase,
    @Inject(DecideApprovalUseCase) private readonly decide: DecideApprovalUseCase,
  ) {}

  @Post('guarantee-fund/movements')
  @RequireStaff(FUND_OPERATORS)
  @StaffAudited('guarantee_fund.movement.propose', {
    entity: 'guarantee_fund',
    bodyFields: ['kind', 'amount', 'currency', 'reason'],
  })
  @ApiCreatedResponse({
    type: ApprovalResponse,
    description: 'Envuelto. Queda pendiente: no mueve dinero hasta que otra persona lo apruebe',
  })
  @ApiBadRequestResponse({ description: 'kind, amount, currency o reason inválidos' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no opera el fondo (FORBIDDEN)' })
  async proposeMovement(
    @Body() body: ProposeFundMovementRequest,
    @Req() request: AppRequest,
  ): Promise<ApprovalResponse> {
    return ApprovalResponse.from(await this.propose.execute({ ...body, staff: actorOf(request) }));
  }

  @Get('approvals')
  @RequireStaff(FUND_OPERATORS)
  @ApiOkResponse({ type: ApprovalsResponse, description: 'Envuelto. De la más reciente' })
  @ApiBadRequestResponse({ description: 'status, limit o cursor inválidos' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no opera el fondo (FORBIDDEN)' })
  async list(@Query() query: ApprovalsQuery): Promise<ApprovalsResponse> {
    const page = await this.listApprovals.execute({
      status: query.status,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    });
    return {
      items: page.items.map((approval) => ApprovalResponse.from(approval)),
      nextCursor: page.nextCursor,
    };
  }

  @Post('approvals/:approvalId/approve')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(FUND_OPERATORS, { stepUp: true })
  @StaffAudited('approval.approve', { entity: 'staff_approval', idParam: 'approvalId' })
  @ApiOkResponse({
    type: ApprovalResponse,
    description: 'Envuelto. El movimiento queda registrado',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o sin autenticación reciente' })
  @ApiForbiddenResponse({
    description:
      'El rol no opera el fondo (FORBIDDEN) o es tu propia propuesta (APPROVAL_SELF_DECISION)',
  })
  @ApiNotFoundResponse({ description: 'APPROVAL_NOT_FOUND' })
  @ApiConflictResponse({ description: 'APPROVAL_NOT_PENDING: ya se decidió o venció' })
  async approve(
    @Param('approvalId') approvalId: string,
    @Req() request: AppRequest,
  ): Promise<ApprovalResponse> {
    return ApprovalResponse.from(
      await this.decide.execute({ id: approvalId, decision: 'approve', staff: actorOf(request) }),
    );
  }

  @Post('approvals/:approvalId/reject')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(FUND_OPERATORS)
  @StaffAudited('approval.reject', {
    entity: 'staff_approval',
    idParam: 'approvalId',
    bodyFields: ['reason'],
  })
  @ApiOkResponse({ type: ApprovalResponse, description: 'Envuelto' })
  @ApiBadRequestResponse({ description: 'Falta el motivo (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'FORBIDDEN o APPROVAL_SELF_DECISION' })
  @ApiNotFoundResponse({ description: 'APPROVAL_NOT_FOUND' })
  @ApiConflictResponse({ description: 'APPROVAL_NOT_PENDING' })
  async reject(
    @Param('approvalId') approvalId: string,
    @Body() body: RejectApprovalRequest,
    @Req() request: AppRequest,
  ): Promise<ApprovalResponse> {
    return ApprovalResponse.from(
      await this.decide.execute({
        id: approvalId,
        decision: 'reject',
        staff: actorOf(request),
        reason: body.reason,
      }),
    );
  }
}
