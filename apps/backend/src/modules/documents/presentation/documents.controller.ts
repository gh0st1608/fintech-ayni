import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { Money } from '../../../shared/domain/value-objects/money';
import { CurrentPrincipal } from '../../../shared/presentation/decorators/current-principal.decorator';
import {
  ListDocumentsUseCase,
  RequestUploadUseCase,
  SubmitDocumentUseCase,
} from '../application/documents.use-cases';
import {
  AdditionalDocumentRequest,
  DocumentResponse,
  DocumentsResponse,
  NationalIdRequest,
  ProofOfIncomeRequest,
  RequestUploadRequest,
  UploadTicketResponse,
} from './documents.dto';

export const DOCUMENT_CURRENCY = Symbol('DOCUMENT_CURRENCY');

/** Documentos y KYC (COPAYNI-43, 46, 47, 48 y 49; docs/api/documents.md). */
@ApiTags('documents')
@ApiBearerAuth()
@Controller({ path: 'me/documents', version: '1' })
export class DocumentsController {
  constructor(
    @Inject(RequestUploadUseCase) private readonly requestUpload: RequestUploadUseCase,
    @Inject(SubmitDocumentUseCase) private readonly submit: SubmitDocumentUseCase,
    @Inject(ListDocumentsUseCase) private readonly listDocuments: ListDocumentsUseCase,
    @Inject(DOCUMENT_CURRENCY) private readonly currency: string,
  ) {}

  @Get()
  @ApiOkResponse({ type: DocumentsResponse, description: 'Envuelto en { success, data, traceId }' })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async list(@CurrentPrincipal() principal: Principal): Promise<DocumentsResponse> {
    return DocumentsResponse.from(await this.listDocuments.execute(principal));
  }

  @Post('uploads')
  @ApiCreatedResponse({
    type: UploadTicketResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiBadRequestResponse({ description: 'Propósito, tipo o tamaño inválidos (VALIDATION_ERROR)' })
  async upload(
    @CurrentPrincipal() principal: Principal,
    @Body() body: RequestUploadRequest,
  ): Promise<UploadTicketResponse> {
    const ticket = await this.requestUpload.execute(principal, body);
    return { ...ticket, expiresAt: ticket.expiresAt.toISOString() };
  }

  @Post('national-id')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DocumentResponse, description: 'approved, rejected o in_review' })
  @ApiUnprocessableEntityResponse({ description: 'UPLOAD_NOT_USABLE (details.uploadId)' })
  async nationalId(
    @CurrentPrincipal() principal: Principal,
    @Body() body: NationalIdRequest,
  ): Promise<DocumentResponse> {
    return DocumentResponse.from(await this.submit.nationalId(principal, body));
  }

  @Post('proof-of-income')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DocumentResponse, description: 'approved, rejected o in_review' })
  @ApiUnprocessableEntityResponse({ description: 'UPLOAD_NOT_USABLE (details.uploadId)' })
  async proofOfIncome(
    @CurrentPrincipal() principal: Principal,
    @Body() body: ProofOfIncomeRequest,
  ): Promise<DocumentResponse> {
    return DocumentResponse.from(
      await this.submit.proofOfIncome(principal, {
        kind: body.kind,
        monthlyIncome: Money.of(body.monthlyIncome, this.currency),
        uploadIds: body.uploadIds,
      }),
    );
  }

  @Post('additional')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: DocumentResponse, description: 'Queda in_review' })
  @ApiUnprocessableEntityResponse({ description: 'UPLOAD_NOT_USABLE (details.uploadId)' })
  async additional(
    @CurrentPrincipal() principal: Principal,
    @Body() body: AdditionalDocumentRequest,
  ): Promise<DocumentResponse> {
    return DocumentResponse.from(await this.submit.additional(principal, body));
  }
}
