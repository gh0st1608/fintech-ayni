import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { type Request } from 'express';

import { type Principal } from '../../../shared/application/ports/access-token-verifier.port';
import { ValidationError } from '../../../shared/errors/app-error';
import { CurrentPrincipal } from '../../../shared/presentation/decorators/current-principal.decorator';
import {
  ListAgreementsUseCase,
  ReadAgreementDocumentUseCase,
  RequestSignatureCodeUseCase,
  SignAgreementUseCase,
} from '../application/agreements.use-cases';
import { AGREEMENT_DOCUMENTS, type AgreementDocument } from '../domain/agreement';
import {
  AgreementDocumentResponse,
  AgreementsResponse,
  AgreementResponse,
  SignAgreementRequest,
  SignatureCodeResponse,
} from './agreements.dto';

/** Firma del contrato y del pagaré al unirse (COPAYNI-89; docs/api/agreements.md). */
@ApiTags('agreements')
@ApiBearerAuth()
@Controller({ path: 'me/agreements', version: '1' })
export class AgreementsController {
  constructor(
    @Inject(ListAgreementsUseCase) private readonly listAgreements: ListAgreementsUseCase,
    @Inject(ReadAgreementDocumentUseCase) private readonly read: ReadAgreementDocumentUseCase,
    @Inject(RequestSignatureCodeUseCase) private readonly requestCode: RequestSignatureCodeUseCase,
    @Inject(SignAgreementUseCase) private readonly signUseCase: SignAgreementUseCase,
  ) {}

  @Get()
  @ApiOkResponse({
    type: AgreementsResponse,
    description: 'Envuelto en { success, data, traceId }',
  })
  @ApiUnauthorizedResponse({ description: 'Sin token o token inválido (UNAUTHORIZED)' })
  async list(@CurrentPrincipal() principal: Principal): Promise<AgreementsResponse> {
    return AgreementsResponse.from(await this.listAgreements.execute(principal));
  }

  @Get(':id/documents/:document')
  @ApiOkResponse({
    type: AgreementDocumentResponse,
    description: 'Devuelve el texto y lo marca leído',
  })
  @ApiNotFoundResponse({ description: 'AGREEMENT_NOT_FOUND' })
  async document(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('document') document: string,
  ): Promise<AgreementDocumentResponse> {
    if (!(AGREEMENT_DOCUMENTS as readonly string[]).includes(document)) {
      throw new ValidationError('Ese documento no existe', { document: 'invalid' });
    }
    return AgreementDocumentResponse.from(
      await this.read.execute(principal, id, document as AgreementDocument),
    );
  }

  @Post(':id/signature-code')
  @ApiCreatedResponse({ type: SignatureCodeResponse, description: 'Envía el código al celular' })
  @ApiUnprocessableEntityResponse({
    description: 'AGREEMENT_DOCUMENTS_NOT_READ (details.pending) o SIGNATURE_DESTINATION_MISSING',
  })
  @ApiConflictResponse({ description: 'AGREEMENT_NOT_PENDING (details.status)' })
  async signatureCode(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('accept-language') acceptLanguage?: string,
  ): Promise<SignatureCodeResponse> {
    return SignatureCodeResponse.from(
      await this.requestCode.execute(principal, id, acceptLanguage),
    );
  }

  @Post(':id/signature')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: AgreementResponse, description: 'Firma los dos documentos a la vez' })
  @ApiUnprocessableEntityResponse({
    description:
      'SIGNATURE_CODE_INVALID (details.attemptsRemaining), SIGNATURE_CODE_EXPIRED o SIGNATURE_ATTEMPTS_EXCEEDED',
  })
  @ApiConflictResponse({ description: 'AGREEMENT_NOT_PENDING (details.status)' })
  async sign(
    @CurrentPrincipal() principal: Principal,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SignAgreementRequest,
    @Req() request: Request,
  ): Promise<AgreementResponse> {
    // Evidencia de la firma: de dónde y con qué se firmó (COPAYNI-89).
    return AgreementResponse.from(
      await this.signUseCase.execute(principal, id, {
        code: body.code,
        ip: request.ip ?? null,
        userAgent: request.headers['user-agent']?.slice(0, 500) ?? null,
      }),
    );
  }
}
