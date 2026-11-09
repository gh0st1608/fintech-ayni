import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
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
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type StaffRole } from '../../../shared/application/ports/staff-authenticator.port';
import { ValidationError } from '../../../shared/errors/app-error';
import { Public } from '../../../shared/presentation/decorators/public.decorator';
import { RequireStaff, StaffGuard } from '../../../shared/presentation/guards/staff.guard';
import { type AppRequest } from '../../../shared/presentation/http/app-request';
import { StaffAudited } from '../../../shared/presentation/interceptors/staff-audit.interceptor';
import {
  DecideKycReviewUseCase,
  GetKycPageUrlUseCase,
  GetKycReviewUseCase,
  ListKycReviewsUseCase,
} from '../application/kyc-review.use-cases';
import {
  KycApproveRequest,
  KycPageUrlResponse,
  KycRejectRequest,
  KycReviewDetailResponse,
  KycReviewsQuery,
  KycReviewsResponse,
  KycReviewSummaryResponse,
} from './admin-kyc.dto';

/** Quién revisa el KYC (matriz de docs/backoffice-plan.md §5). Soporte no ve los documentos. */
const KYC_REVIEWERS: readonly StaffRole[] = ['operations', 'super_admin'];
const DEFAULT_PAGE_SIZE = 25;

const REVIEW_ID = new ParseUUIDPipe({
  exceptionFactory: () => new ValidationError('El id debe ser un UUID', { id: 'invalid' }),
});
const PAGE = new ParseIntPipe({
  exceptionFactory: () => new ValidationError('La página debe ser un número', { page: 'invalid' }),
});

/**
 * Revisión manual del KYC (docs/backoffice-plan.md, fase 2): con `KYC_PROVIDER=manual`, cada
 * documento queda en revisión hasta que operaciones lo aprueba o rechaza. Ver un documento y
 * resolverlo quedan en la auditoría del personal.
 */
@ApiTags('admin')
@ApiBearerAuth()
@Public()
@UseGuards(StaffGuard)
@Controller({ path: 'admin/v1/kyc/reviews', version: VERSION_NEUTRAL })
export class AdminKycController {
  constructor(
    @Inject(ListKycReviewsUseCase) private readonly listReviews: ListKycReviewsUseCase,
    @Inject(GetKycReviewUseCase) private readonly getReview: GetKycReviewUseCase,
    @Inject(GetKycPageUrlUseCase) private readonly pageUrl: GetKycPageUrlUseCase,
    @Inject(DecideKycReviewUseCase) private readonly decide: DecideKycReviewUseCase,
  ) {}

  @Get()
  @RequireStaff(KYC_REVIEWERS)
  @ApiOkResponse({
    type: KycReviewsResponse,
    description: 'Envuelto. En revisión, del más antiguo al más nuevo; resueltos, al revés',
  })
  @ApiBadRequestResponse({ description: 'status, type, limit o cursor inválidos' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no revisa KYC (FORBIDDEN)' })
  async list(@Query() query: KycReviewsQuery): Promise<KycReviewsResponse> {
    const page = await this.listReviews.execute({
      status: query.status ?? 'in_review',
      type: query.type,
      limit: query.limit ?? DEFAULT_PAGE_SIZE,
      cursor: query.cursor ?? null,
    });
    return {
      items: page.items.map((item) => KycReviewSummaryResponse.from(item)),
      nextCursor: page.nextCursor,
    };
  }

  @Get(':id')
  @RequireStaff(KYC_REVIEWERS)
  @ApiOkResponse({ type: KycReviewDetailResponse, description: 'Envuelto' })
  @ApiBadRequestResponse({ description: 'id no es UUID (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no revisa KYC (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'KYC_REVIEW_NOT_FOUND' })
  async detail(@Param('id', REVIEW_ID) id: string): Promise<KycReviewDetailResponse> {
    return KycReviewDetailResponse.fromView(await this.getReview.execute(id));
  }

  @Get(':id/pages/:page/url')
  @RequireStaff(KYC_REVIEWERS)
  @StaffAudited('kyc.document.view', { entity: 'kyc_document', idParam: 'id' })
  @ApiOkResponse({ type: KycPageUrlResponse, description: 'Envuelto. Acción auditada' })
  @ApiBadRequestResponse({ description: 'id no es UUID o page no es un número' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no revisa KYC (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'KYC_REVIEW_NOT_FOUND o KYC_PAGE_NOT_FOUND' })
  async url(
    @Param('id', REVIEW_ID) id: string,
    @Param('page', PAGE) page: number,
  ): Promise<KycPageUrlResponse> {
    const signed = await this.pageUrl.execute(id, page);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(KYC_REVIEWERS)
  @StaffAudited('kyc.approve', {
    entity: 'kyc_document',
    idParam: 'id',
    bodyFields: ['monthlyIncome', 'note'],
  })
  @ApiOkResponse({ type: KycReviewDetailResponse, description: 'Envuelto. El documento resuelto' })
  @ApiBadRequestResponse({ description: 'id no es UUID o cuerpo inválido (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no revisa KYC (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'KYC_REVIEW_NOT_FOUND' })
  @ApiConflictResponse({ description: 'Ya lo resolvió otra persona (KYC_ALREADY_REVIEWED)' })
  @ApiUnprocessableEntityResponse({
    description: 'Ingreso en un documento que no es comprobante (INCOME_ADJUSTMENT_NOT_ALLOWED)',
  })
  async approve(
    @Param('id', REVIEW_ID) id: string,
    @Body() body: KycApproveRequest,
    @Req() request: AppRequest,
  ): Promise<KycReviewDetailResponse> {
    const decided = await this.decide.execute({
      id,
      input: {
        action: 'approve',
        ...(body.monthlyIncome !== undefined && { monthlyIncome: body.monthlyIncome }),
      },
      staffId: request.staff!.staffId,
    });
    return KycReviewDetailResponse.fromView(decided);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequireStaff(KYC_REVIEWERS)
  @StaffAudited('kyc.reject', {
    entity: 'kyc_document',
    idParam: 'id',
    bodyFields: ['reason', 'note'],
  })
  @ApiOkResponse({ type: KycReviewDetailResponse, description: 'Envuelto. El documento resuelto' })
  @ApiBadRequestResponse({ description: 'id no es UUID o motivo inválido (VALIDATION_ERROR)' })
  @ApiUnauthorizedResponse({ description: 'Sin token del personal o token inválido' })
  @ApiForbiddenResponse({ description: 'El rol no revisa KYC (FORBIDDEN)' })
  @ApiNotFoundResponse({ description: 'KYC_REVIEW_NOT_FOUND' })
  @ApiConflictResponse({ description: 'Ya lo resolvió otra persona (KYC_ALREADY_REVIEWED)' })
  async reject(
    @Param('id', REVIEW_ID) id: string,
    @Body() body: KycRejectRequest,
    @Req() request: AppRequest,
  ): Promise<KycReviewDetailResponse> {
    const decided = await this.decide.execute({
      id,
      input: { action: 'reject', reason: body.reason },
      staffId: request.staff!.staffId,
    });
    return KycReviewDetailResponse.fromView(decided);
  }
}
